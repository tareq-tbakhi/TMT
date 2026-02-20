"""
Batch sync API routes.

Endpoint:
    POST /sync/batch — Upload queued offline events (SOS, updates, triage)
                        after days/weeks without connectivity.

Each event is processed idempotently (event_id dedup).
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.postgres import get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.sos_request import SosRequest, SOSSource, SOSStatus, PatientStatus
from app.api.middleware.auth import get_current_user
from app.api.middleware.audit import log_audit
from app.api.websocket.handler import broadcast_sos

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SyncEvent(BaseModel):
    """A single offline event to sync."""
    event_id: str = Field(..., description="Unique event ID for idempotency")
    type: str = Field(..., description="Event type: sos_create, sos_update, patient_update")
    data: dict[str, Any] = Field(default_factory=dict)
    device_time: str = Field(..., description="ISO timestamp from device clock")


class BatchSyncRequest(BaseModel):
    """Batch of offline events to sync."""
    events: list[SyncEvent] = Field(..., max_length=100)


class EventResult(BaseModel):
    event_id: str
    status: str  # "created", "duplicate", "error", "updated"
    detail: Optional[str] = None
    sos_id: Optional[str] = None


class BatchSyncResponse(BaseModel):
    results: list[EventResult]
    total: int
    created: int
    duplicates: int
    errors: int


# ---------------------------------------------------------------------------
# Status short code mapping (from mobile compact payload)
# ---------------------------------------------------------------------------

_STATUS_SHORT_MAP = {"S": "safe", "I": "injured", "T": "trapped", "E": "evacuate"}


def _resolve_patient_status(raw: str) -> PatientStatus:
    """Resolve patient status from full name or short code."""
    mapped = _STATUS_SHORT_MAP.get(raw, raw)
    try:
        return PatientStatus(mapped)
    except ValueError:
        return PatientStatus.INJURED


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/sync/batch", response_model=BatchSyncResponse)
async def batch_sync(
    payload: BatchSyncRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a batch of offline events.

    Designed for reconnection after extended offline periods (days/weeks).
    Each event is processed idempotently — duplicates are safely skipped.
    Device timestamps are stored alongside server timestamps for reconciliation.
    """
    results: list[EventResult] = []
    created_count = 0
    duplicate_count = 0
    error_count = 0

    for event in payload.events:
        try:
            result = await _process_event(db, event, current_user)
            results.append(result)

            if result.status == "created" or result.status == "updated":
                created_count += 1
            elif result.status == "duplicate":
                duplicate_count += 1
            else:
                error_count += 1

        except Exception as exc:
            logger.error("Error processing sync event %s: %s", event.event_id, exc)
            results.append(EventResult(
                event_id=event.event_id,
                status="error",
                detail=str(exc),
            ))
            error_count += 1

    await db.flush()

    await log_audit(
        action="batch_sync",
        resource="sync",
        resource_id=None,
        details=f"Synced {len(payload.events)} events: {created_count} created, {duplicate_count} duplicates, {error_count} errors",
        request=request,
        db=db,
    )

    return BatchSyncResponse(
        results=results,
        total=len(payload.events),
        created=created_count,
        duplicates=duplicate_count,
        errors=error_count,
    )


# ---------------------------------------------------------------------------
# Event processors
# ---------------------------------------------------------------------------

async def _process_event(
    db: AsyncSession,
    event: SyncEvent,
    current_user: User,
) -> EventResult:
    """Route event to the appropriate processor."""
    match event.type:
        case "sos_create":
            return await _process_sos_create(db, event, current_user)
        case "sos_update":
            return await _process_sos_update(db, event, current_user)
        case "patient_update":
            return await _process_patient_update(db, event, current_user)
        case _:
            return EventResult(
                event_id=event.event_id,
                status="error",
                detail=f"Unknown event type: {event.type}",
            )


async def _process_sos_create(
    db: AsyncSession,
    event: SyncEvent,
    current_user: User,
) -> EventResult:
    """Create an SOS request from an offline event (idempotent)."""
    data = event.data

    # Dedup: check if event_id already used as mesh_message_id
    existing = await db.execute(
        select(SosRequest).where(
            SosRequest.mesh_message_id == event.event_id
        ).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return EventResult(
            event_id=event.event_id,
            status="duplicate",
            detail="SOS already exists with this event ID",
        )

    # Resolve patient
    patient_id = data.get("patient_id") or str(current_user.patient_id) if hasattr(current_user, 'patient_id') and current_user.patient_id else None
    if not patient_id:
        return EventResult(
            event_id=event.event_id,
            status="error",
            detail="No patient_id in event data",
        )

    patient_status = _resolve_patient_status(data.get("patient_status", "injured"))
    severity = data.get("severity", 3)
    if not isinstance(severity, int) or severity < 1 or severity > 5:
        severity = 3

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    sos = SosRequest(
        id=uuid.uuid4(),
        patient_id=uuid.UUID(patient_id) if isinstance(patient_id, str) else patient_id,
        latitude=latitude,
        longitude=longitude,
        location=(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)
            if latitude is not None and longitude is not None
            else None
        ),
        status=SOSStatus.PENDING,
        patient_status=patient_status,
        severity=severity,
        source=SOSSource.API,  # Came through sync but originally from app
        details=data.get("details"),
        mesh_message_id=event.event_id,  # Store event_id for dedup
        triage_transcript=data.get("triage_transcript"),
    )
    db.add(sos)
    await db.flush()

    # Broadcast
    try:
        await broadcast_sos({
            "id": str(sos.id),
            "patient_id": patient_id,
            "latitude": latitude,
            "longitude": longitude,
            "patient_status": patient_status.value,
            "severity": severity,
            "source": "sync",
            "details": data.get("details"),
            "created_at": sos.created_at.isoformat() if sos.created_at else datetime.utcnow().isoformat(),
            "device_time": event.device_time,
        })
    except Exception:
        logger.warning("Failed to broadcast synced SOS %s", sos.id)

    return EventResult(
        event_id=event.event_id,
        status="created",
        sos_id=str(sos.id),
    )


async def _process_sos_update(
    db: AsyncSession,
    event: SyncEvent,
    current_user: User,
) -> EventResult:
    """Update an existing SOS (status change, triage data, resolution)."""
    data = event.data
    sos_id = data.get("sos_id")

    if not sos_id:
        return EventResult(
            event_id=event.event_id,
            status="error",
            detail="Missing sos_id in event data",
        )

    result = await db.execute(
        select(SosRequest).where(SosRequest.id == uuid.UUID(sos_id))
    )
    sos = result.scalar_one_or_none()

    if sos is None:
        return EventResult(
            event_id=event.event_id,
            status="error",
            detail=f"SOS {sos_id} not found",
        )

    # Apply updates
    if "status" in data:
        try:
            sos.status = SOSStatus(data["status"])
        except ValueError:
            pass

    if "patient_status" in data:
        sos.patient_status = _resolve_patient_status(data["patient_status"])

    if "severity" in data:
        sev = data["severity"]
        if isinstance(sev, int) and 1 <= sev <= 5:
            sos.severity = sev

    if "details" in data:
        sos.details = data["details"]

    if "triage_transcript" in data:
        sos.triage_transcript = data["triage_transcript"]

    if data.get("resolved"):
        sos.status = SOSStatus.RESOLVED
        sos.resolved_at = datetime.fromisoformat(event.device_time) if event.device_time else datetime.utcnow()

    await db.flush()

    return EventResult(
        event_id=event.event_id,
        status="updated",
        sos_id=str(sos.id),
    )


async def _process_patient_update(
    db: AsyncSession,
    event: SyncEvent,
    current_user: User,
) -> EventResult:
    """Update patient profile data (location, medical info cached offline)."""
    data = event.data
    patient_id = data.get("patient_id") or (str(current_user.patient_id) if hasattr(current_user, 'patient_id') and current_user.patient_id else None)

    if not patient_id:
        return EventResult(
            event_id=event.event_id,
            status="error",
            detail="No patient_id in event data",
        )

    result = await db.execute(
        select(Patient).where(Patient.id == uuid.UUID(patient_id))
    )
    patient = result.scalar_one_or_none()

    if patient is None:
        return EventResult(
            event_id=event.event_id,
            status="error",
            detail=f"Patient {patient_id} not found",
        )

    # Update location if provided
    lat = data.get("latitude")
    lon = data.get("longitude")
    if lat is not None and lon is not None:
        patient.latitude = lat
        patient.longitude = lon

    await db.flush()

    return EventResult(
        event_id=event.event_id,
        status="updated",
    )
