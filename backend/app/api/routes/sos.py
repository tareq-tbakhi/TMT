"""
SOS API routes.

Endpoints:
    POST /sos             — Send SOS via internet (patient role)
    GET  /sos             — List SOS requests (department admin role)
    PUT  /sos/{id}/status — Update SOS request status
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.api.middleware.rate_limit import rate_limit
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole, DEPARTMENT_ADMIN_ROLES
from app.models.sos_request import SosRequest, SOSStatus, SOSSource, PatientStatus
from app.api.middleware.auth import get_current_user, require_role, require_any_department_admin
from app.api.middleware.audit import log_audit
from app.services import patient_service
from app.api.websocket.handler import broadcast_sos

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SOSCreateRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    patient_status: PatientStatus = PatientStatus.INJURED
    severity: int = Field(default=3, ge=1, le=5)
    details: Optional[str] = None
    triage_transcript: Optional[list[dict]] = None  # [{role, content, timestamp}, ...]


class SOSTriageUpdateRequest(BaseModel):
    """Patient updates their SOS with triage info after the initial send."""
    patient_status: Optional[PatientStatus] = None
    severity: Optional[int] = Field(default=None, ge=1, le=5)
    details: Optional[str] = None
    triage_transcript: Optional[list[dict]] = None


class SOSStatusUpdateRequest(BaseModel):
    status: SOSStatus
    hospital_notified_id: Optional[UUID] = None


class SOSResponse(BaseModel):
    id: UUID
    patient_id: UUID
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: SOSStatus
    patient_status: Optional[PatientStatus] = None
    severity: int
    source: SOSSource
    hospital_notified_id: Optional[UUID] = None
    routed_department: Optional[str] = None
    facility_notified_id: Optional[UUID] = None
    details: Optional[str] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SOSListResponse(BaseModel):
    sos_requests: list[SOSResponse]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/sos", response_model=SOSResponse, status_code=status.HTTP_201_CREATED,
              dependencies=[rate_limit(max_requests=10, window_seconds=60, key_prefix="sos")])
async def send_sos(
    payload: SOSCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """
    Send an SOS request via internet.
    Only patients can send SOS. The patient_id is derived from the JWT token.
    """
    if current_user.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is not linked to a patient record",
        )

    # Verify the patient record exists
    patient = await patient_service.get_patient(db, current_user.patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found",
        )

    # Use patient's stored location as fallback
    lat = payload.latitude or patient.get("latitude")
    lon = payload.longitude or patient.get("longitude")

    # Sync the patient's stored location with the freshest data
    if payload.latitude is not None and payload.longitude is not None:
        try:
            await patient_service.update_patient_location(
                db, current_user.patient_id, payload.latitude, payload.longitude
            )
        except Exception:
            pass  # Non-critical — SOS creation is the priority

    sos = await patient_service.create_sos_request(
        db,
        patient_id=current_user.patient_id,
        latitude=lat,
        longitude=lon,
        patient_status=payload.patient_status,
        severity=payload.severity,
        source=SOSSource.API,
        details=payload.details,
    )

    # Save triage conversation transcript if provided
    if payload.triage_transcript:
        sos.triage_transcript = payload.triage_transcript
        await db.flush()

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=str(sos.id),
        user_id=current_user.id,
        details=f"SOS sent: severity={payload.severity}, status={payload.patient_status.value}",
        request=request,
        db=db,
    )

    # Increment patient's SOS count for trust tracking
    try:
        from sqlalchemy import select as sa_select
        from app.models.patient import Patient as PatientModel
        p_result = await db.execute(sa_select(PatientModel).where(PatientModel.id == current_user.patient_id))
        patient_obj = p_result.scalar_one_or_none()
        if patient_obj:
            patient_obj.total_sos_count = (patient_obj.total_sos_count or 0) + 1
            await db.flush()
    except Exception:
        pass  # Non-critical

    # Broadcast SOS to dashboards and live map
    sos_payload = {
        "id": str(sos.id),
        "patient_id": str(sos.patient_id),
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "status": sos.status.value,
        "patient_status": sos.patient_status.value if sos.patient_status else None,
        "severity": sos.severity,
        "source": sos.source.value,
        "details": sos.details,
        "created_at": sos.created_at.isoformat() if sos.created_at else None,
        "patient_trust_score": patient.get("trust_score", 1.0) if patient else 1.0,
        "patient_info": {
            "name": patient.get("name"),
            "phone": patient.get("phone"),
            "blood_type": patient.get("blood_type"),
            "mobility": patient.get("mobility"),
            "gender": patient.get("gender"),
            "date_of_birth": str(patient.get("date_of_birth")) if patient.get("date_of_birth") else None,
            "chronic_conditions": patient.get("chronic_conditions", []),
            "allergies": patient.get("allergies", []),
            "current_medications": patient.get("current_medications", []),
            "special_equipment": patient.get("special_equipment", []),
            "emergency_contacts": patient.get("emergency_contacts", []),
            "trust_score": patient.get("trust_score", 1.0),
            "total_sos_count": patient.get("total_sos_count", 0),
            "false_alarm_count": patient.get("false_alarm_count", 0),
        } if patient else None,
    }
    await broadcast_sos(sos_payload)

    # Trigger AI triage → creates Alert record visible on dashboard & map
    try:
        from tasks.sos_tasks import triage_sos_request
        triage_sos_request.delay(sos_payload)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Could not enqueue SOS triage task: %s", exc)

    return sos


@router.post("/sos/bulk", status_code=status.HTTP_202_ACCEPTED)
async def bulk_sos(
    payloads: list[SOSCreateRequest],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """
    Bulk SOS dispatch — for mass-casualty events.
    Hospital admins can submit multiple SOS on behalf of patients.
    Each SOS is triaged in parallel via Celery group.
    """
    if len(payloads) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50 SOS requests per bulk submission",
        )

    sos_payloads = []
    for p in payloads:
        lat = p.latitude or 31.5017
        lon = p.longitude or 34.4668
        sos_payloads.append({
            "latitude": lat,
            "longitude": lon,
            "patient_status": p.patient_status.value,
            "severity": p.severity,
            "details": p.details,
            "source": "bulk_api",
        })

    # Dispatch all triage tasks in parallel via Celery group
    try:
        from celery import group
        from tasks.sos_tasks import triage_sos_request

        job = group(
            triage_sos_request.s(payload) for payload in sos_payloads
        )
        result = job.apply_async()

        await log_audit(
            action="create",
            resource="sos_request",
            user_id=current_user.id,
            details=f"Bulk SOS dispatched: {len(sos_payloads)} requests",
            request=request,
            db=db,
        )

        return {
            "batch_id": str(result.id),
            "count": len(sos_payloads),
            "status": "dispatched",
        }
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Bulk SOS dispatch failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to dispatch bulk SOS tasks",
        )


@router.patch("/sos/{sos_id}/triage", response_model=SOSResponse)
async def update_sos_triage(
    sos_id: UUID,
    payload: SOSTriageUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """
    Patient updates their own SOS with triage data (after initial send).
    Only the owning patient can update their SOS.
    """
    # Verify the SOS belongs to this patient
    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(SosRequest).where(
            SosRequest.id == sos_id,
            SosRequest.patient_id == current_user.patient_id,
        )
    )
    sos = result.scalar_one_or_none()
    if sos is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOS request not found",
        )

    update_data: dict = {}
    if payload.patient_status is not None:
        update_data["patient_status"] = payload.patient_status
    if payload.severity is not None:
        update_data["severity"] = payload.severity
    if payload.details is not None:
        update_data["details"] = payload.details
    if payload.triage_transcript is not None:
        update_data["triage_transcript"] = payload.triage_transcript

    if update_data:
        updated = await patient_service.update_sos_request(db, sos_id, update_data)
    else:
        updated = sos

    await log_audit(
        action="update",
        resource="sos_request",
        resource_id=str(sos_id),
        user_id=current_user.id,
        details=f"Patient updated SOS triage data",
        request=request,
        db=db,
    )

    return updated


@router.get("/sos", response_model=SOSListResponse)
async def list_sos_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
    status_filter: Optional[SOSStatus] = None,
    severity_min: Optional[int] = None,
    routed_department: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List SOS requests. Department staff see SOS relevant to their department/facility.
    Super admin sees all. Can filter by routed_department.
    """
    hospital_id = current_user.hospital_id

    # Determine department filter
    dept_filter = routed_department
    if current_user.role != UserRole.SUPER_ADMIN and dept_filter is None:
        dept_filter = current_user.department_type

    sos_list, total = await patient_service.list_sos_requests(
        db,
        hospital_id=hospital_id if current_user.role != UserRole.SUPER_ADMIN else None,
        status_filter=status_filter,
        severity_min=severity_min,
        routed_department=dept_filter,
        limit=limit,
        offset=offset,
    )

    await log_audit(
        action="read",
        resource="sos_request",
        user_id=current_user.id,
        details=f"Listed SOS requests (status={status_filter}, dept={dept_filter})",
        request=request,
        db=db,
    )

    return SOSListResponse(
        sos_requests=[SOSResponse.model_validate(s) for s in sos_list],
        total=total,
    )


@router.put("/sos/{sos_id}/status", response_model=SOSResponse)
async def update_sos_status(
    sos_id: UUID,
    payload: SOSStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Update the status of an SOS request (e.g., acknowledge, dispatch, resolve)."""
    update_data: dict = {"status": payload.status}
    if payload.hospital_notified_id is not None:
        update_data["hospital_notified_id"] = payload.hospital_notified_id
    if payload.status == SOSStatus.RESOLVED:
        update_data["resolved_at"] = datetime.utcnow()

    sos = await patient_service.update_sos_request(db, sos_id, update_data)
    if sos is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOS request not found",
        )

    await log_audit(
        action="update",
        resource="sos_request",
        resource_id=str(sos_id),
        user_id=current_user.id,
        details=f"SOS status updated to {payload.status.value}",
        request=request,
        db=db,
    )

    return sos


# ---------------------------------------------------------------------------
# AI Triage Conversation (features 2.2.12 + 2.2.13)
#
#   POST /sos/{id}/conversation/message — user message in → AI reply out
#   GET  /sos/{id}/conversation         — full stored transcript
#
# The transcript is persisted on SosRequest.triage_transcript as the
# conversation happens, so responders can review it live and nothing is
# lost if the patient's phone dies mid-conversation. When no LLM key is
# configured (or the LLM fails), replies come from a deterministic
# scripted flow and are marked mode="scripted" — the mobile client then
# drives its identical local offline flow instead.
# ---------------------------------------------------------------------------

MAX_STORED_TRANSCRIPT_MESSAGES = 200
MAX_LOCAL_CONTEXT_MESSAGES = 12


class ConversationMessagePayload(BaseModel):
    """Incoming conversation turn from the patient's device."""
    content: str = Field(default="", max_length=4000)
    start: bool = False  # True → handshake / conversation start (content optional)
    battery_low: bool = False  # expedite: wrap up within 2 questions
    language: str = Field(default="en", max_length=8)  # "en" | "ar"
    client_message_id: Optional[str] = Field(default=None, max_length=64)
    # Messages the client rendered locally (offline scripted flow) that the
    # server hasn't stored yet — keeps the persisted transcript complete.
    local_context: Optional[list[dict]] = None


class QuickReplyOut(BaseModel):
    id: str
    label: str


class ConversationReplyOut(BaseModel):
    id: str
    role: str = "ai"
    content: str
    timestamp: datetime
    quick_replies: list[QuickReplyOut] = Field(default_factory=list)


class ConversationMessageResponse(BaseModel):
    sos_id: UUID
    mode: str  # "llm" | "scripted"
    reply: Optional[ConversationReplyOut] = None
    # Structured triage extraction so far (snake_case keys, whitelisted values)
    triage_data: Optional[dict] = None
    conversation_complete: bool = False
    urgency_detected: bool = False


class ConversationTranscriptResponse(BaseModel):
    sos_id: UUID
    mode_available: str  # which engine would answer next ("llm" | "scripted")
    messages: list[dict]
    message_count: int


def _sanitize_transcript_entry(entry: object) -> Optional[dict]:
    """Whitelist a transcript entry to {role, content, timestamp}."""
    if not isinstance(entry, dict):
        return None
    role = entry.get("role")
    if role not in ("ai", "user"):
        return None
    content = str(entry.get("content", "")).strip()
    if not content:
        return None
    timestamp = entry.get("timestamp")
    if not isinstance(timestamp, str) or not timestamp:
        timestamp = datetime.utcnow().isoformat()
    return {"role": role, "content": content[:4000], "timestamp": timestamp[:64]}


def _transcript_has_entry(transcript: list[dict], entry: dict, window: int = 8) -> bool:
    """Dedup check against the tail of the stored transcript."""
    for existing in transcript[-window:]:
        if existing.get("role") == entry.get("role") and existing.get("content") == entry.get("content"):
            return True
    return False


async def _get_owned_sos(db: AsyncSession, sos_id: UUID, current_user: User) -> SosRequest:
    """Load an SOS owned by the current patient, or 404."""
    from sqlalchemy import select as sa_select

    result = await db.execute(
        sa_select(SosRequest).where(
            SosRequest.id == sos_id,
            SosRequest.patient_id == current_user.patient_id,
        )
    )
    sos = result.scalar_one_or_none()
    if sos is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOS request not found",
        )
    return sos


@router.post(
    "/sos/{sos_id}/conversation/message",
    response_model=ConversationMessageResponse,
    dependencies=[rate_limit(max_requests=30, window_seconds=60, key_prefix="sos_conv")],
)
async def post_sos_conversation_message(
    sos_id: UUID,
    payload: ConversationMessagePayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.PATIENT)),
):
    """
    One turn of the AI triage conversation for an active SOS.

    Send ``start=true`` (empty content allowed) to open the conversation:
    the response's ``mode`` tells the client whether the server will drive
    the chat ("llm") or the client should run its local scripted flow
    ("scripted"). Each subsequent user message returns the next AI reply,
    optional quick-reply suggestions, structured triage extraction, and a
    completion signal. The transcript is persisted per SOS on every turn.
    """
    from uuid import uuid4

    from app.services.ai_agent import triage_conversation

    sos = await _get_owned_sos(db, sos_id, current_user)

    if sos.status in (SOSStatus.RESOLVED, SOSStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This SOS is closed — start a new SOS if you still need help",
        )

    now = datetime.utcnow()
    mode_available = "llm" if triage_conversation.is_llm_available() else "scripted"

    transcript: list[dict] = [
        m for m in (sos.triage_transcript or []) if isinstance(m, dict)
    ]

    # Merge messages the client rendered locally but hasn't synced yet
    for raw_entry in (payload.local_context or [])[:MAX_LOCAL_CONTEXT_MESSAGES]:
        clean = _sanitize_transcript_entry(raw_entry)
        if clean and not _transcript_has_entry(transcript, clean):
            transcript.append(clean)

    content = (payload.content or "").strip()

    # ── Handshake / conversation start ────────────────────────────────
    if payload.start and not content:
        reply_out: Optional[ConversationReplyOut] = None
        if not any(m.get("role") == "ai" for m in transcript):
            # Standalone client with nothing rendered yet — give it the
            # deterministic opener (the LLM takes over from the next turn).
            first = triage_conversation.scripted_turn([], language=payload.language)
            transcript.append(
                {"role": "ai", "content": first["message"], "timestamp": now.isoformat()}
            )
            reply_out = ConversationReplyOut(
                id=f"srv_{uuid4().hex[:12]}",
                content=first["message"],
                timestamp=now,
                quick_replies=[QuickReplyOut(**qr) for qr in first["quick_replies"]],
            )

        sos.triage_transcript = transcript[-MAX_STORED_TRANSCRIPT_MESSAGES:]
        await db.flush()

        return ConversationMessageResponse(
            sos_id=sos_id,
            mode=mode_available,
            reply=reply_out,
            triage_data=None,
            conversation_complete=False,
            urgency_detected=False,
        )

    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content is required (or set start=true)",
        )

    # ── Persist the user message ──────────────────────────────────────
    transcript.append({"role": "user", "content": content, "timestamp": now.isoformat()})

    # Compact patient profile so the LLM doesn't re-ask known facts.
    patient_context = None
    try:
        patient = await patient_service.get_patient(db, current_user.patient_id)
        if patient:
            patient_context = {
                "mobility": patient.get("mobility"),
                "blood_type": patient.get("blood_type"),
                "chronic_conditions": patient.get("chronic_conditions") or [],
                "special_equipment": patient.get("special_equipment") or [],
            }
    except Exception:  # noqa: BLE001 — profile context is optional
        patient_context = None

    # ── Produce the AI turn (urgency fast-path → LLM → scripted) ─────
    result = await triage_conversation.run_triage_turn(
        transcript,
        battery_low=payload.battery_low,
        language=payload.language,
        patient_context=patient_context,
    )

    transcript.append(
        {"role": "ai", "content": result["message"], "timestamp": datetime.utcnow().isoformat()}
    )
    sos.triage_transcript = transcript[-MAX_STORED_TRANSCRIPT_MESSAGES:]

    # ── Progressive structured refinement of the SOS record ──────────
    extraction = result.get("triage_data") or {}
    if result["mode"] == "llm" and extraction:
        derived_status = triage_conversation.derive_patient_status(extraction)
        if derived_status:
            try:
                sos.patient_status = PatientStatus(derived_status)
            except ValueError:
                pass
        derived_severity = triage_conversation.derive_severity(extraction)
        if derived_severity is not None:
            sos.severity = derived_severity
        if result.get("conversation_complete"):
            summary = triage_conversation.build_details_summary(extraction)
            if summary:
                sos.details = summary

    await db.flush()

    await log_audit(
        action="update",
        resource="sos_conversation",
        resource_id=str(sos_id),
        user_id=current_user.id,
        details=f"Triage conversation turn (mode={result['mode']}, complete={result['conversation_complete']})",
        request=request,
        db=db,
    )

    return ConversationMessageResponse(
        sos_id=sos_id,
        mode=result["mode"],
        reply=ConversationReplyOut(
            id=f"srv_{uuid4().hex[:12]}",
            content=result["message"],
            timestamp=datetime.utcnow(),
            quick_replies=[QuickReplyOut(**qr) for qr in result["quick_replies"]],
        ),
        triage_data=extraction or None,
        conversation_complete=bool(result["conversation_complete"]),
        urgency_detected=bool(result["urgency_detected"]),
    )


@router.get("/sos/{sos_id}/conversation", response_model=ConversationTranscriptResponse)
async def get_sos_conversation(
    sos_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full triage conversation transcript for an SOS.

    Accessible to the owning patient and to department admins
    (for responder review of what the patient reported).
    """
    from sqlalchemy import select as sa_select

    from app.services.ai_agent import triage_conversation

    result = await db.execute(sa_select(SosRequest).where(SosRequest.id == sos_id))
    sos = result.scalar_one_or_none()
    if sos is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOS request not found",
        )

    if current_user.role == UserRole.PATIENT:
        if sos.patient_id != current_user.patient_id:
            # Don't leak existence of other patients' SOS
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SOS request not found",
            )
    elif current_user.role not in DEPARTMENT_ADMIN_ROLES and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this conversation",
        )

    messages = [
        m for m in (sos.triage_transcript or [])
        if isinstance(m, dict) and m.get("role") in ("ai", "user")
    ]

    await log_audit(
        action="read",
        resource="sos_conversation",
        resource_id=str(sos_id),
        user_id=current_user.id,
        details=f"Viewed triage conversation ({len(messages)} messages)",
        request=request,
        db=db,
    )

    return ConversationTranscriptResponse(
        sos_id=sos_id,
        mode_available="llm" if triage_conversation.is_llm_available() else "scripted",
        messages=messages,
        message_count=len(messages),
    )
