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
