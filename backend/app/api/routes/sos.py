"""
SOS API routes.

Endpoints:
    POST /sos             — Send SOS via internet (patient role)
    GET  /sos             — List SOS requests (hospital role)
    PUT  /sos/{id}/status — Update SOS request status
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.sos_request import SosRequest, SOSStatus, SOSSource, PatientStatus
from app.api.middleware.auth import get_current_user, require_role
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

@router.post("/sos", response_model=SOSResponse, status_code=status.HTTP_201_CREATED)
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

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=str(sos.id),
        user_id=current_user.id,
        details=f"SOS sent: severity={payload.severity}, status={payload.patient_status.value}",
        request=request,
        db=db,
    )

    # Broadcast SOS to dashboards and live map
    await broadcast_sos({
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
    })

    return sos


@router.get("/sos", response_model=SOSListResponse)
async def list_sos_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)),
    status_filter: Optional[SOSStatus] = None,
    severity_min: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List SOS requests. Hospital staff see SOS requests relevant to their area.
    """
    hospital_id = current_user.hospital_id

    sos_list, total = await patient_service.list_sos_requests(
        db,
        hospital_id=hospital_id,
        status_filter=status_filter,
        severity_min=severity_min,
        limit=limit,
        offset=offset,
    )

    await log_audit(
        action="read",
        resource="sos_request",
        user_id=current_user.id,
        details=f"Listed SOS requests (status={status_filter}, min_sev={severity_min})",
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
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)),
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
