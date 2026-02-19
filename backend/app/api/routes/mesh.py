"""
Mesh Network API routes.

Endpoints:
    POST /mesh/relay     — Relay SOS from Bridgefy mesh network (device with internet)
    POST /mesh/ack       — Acknowledge SOS delivery (for mesh relay confirmation)
    GET  /mesh/stats     — Get mesh network statistics
    POST /mesh/heartbeat — Device heartbeat for mesh network monitoring
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.sos_request import SosRequest, SOSStatus, SOSSource, PatientStatus
from app.api.middleware.auth import get_current_user
from app.api.middleware.audit import log_audit
from app.services import patient_service
from app.api.websocket.handler import broadcast_sos

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MeshSOSPayload(BaseModel):
    """Payload structure for SOS relayed via Bridgefy mesh."""
    message_id: str = Field(..., description="Bridgefy message UUID for deduplication")
    patient_id: str = Field(..., description="Patient ID from the original sender")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    patient_status: Optional[str] = Field(default="injured", description="safe/injured/trapped/evacuate")
    severity: int = Field(default=3, ge=1, le=5)
    details: Optional[str] = None
    original_timestamp: Optional[int] = Field(None, description="Unix timestamp when SOS was created")
    hop_count: Optional[int] = Field(default=0, description="Number of mesh hops")
    relay_device_id: str = Field(..., description="Device ID that is relaying to backend")


class MeshSOSResponse(BaseModel):
    """Response for mesh SOS relay."""
    success: bool
    sos_id: Optional[str] = None
    message_id: str
    is_duplicate: bool = False
    message: str


class MeshAckRequest(BaseModel):
    """Acknowledgment for SOS delivery confirmation."""
    message_id: str
    sos_id: Optional[str] = None
    delivered_to: str = Field(..., description="backend/patient/responder")
    relay_device_id: str


class MeshAckResponse(BaseModel):
    """Response for mesh acknowledgment."""
    success: bool
    message: str


class MeshHeartbeatRequest(BaseModel):
    """Device heartbeat for mesh network monitoring."""
    device_id: str
    user_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    nearby_device_count: int = 0
    is_connected_to_internet: bool = True
    battery_level: Optional[int] = None


class MeshHeartbeatResponse(BaseModel):
    """Response for mesh heartbeat."""
    success: bool
    server_time: str


class MeshStatsResponse(BaseModel):
    """Mesh network statistics."""
    total_mesh_sos: int
    mesh_sos_today: int
    average_hop_count: float
    unique_relay_devices: int
    active_mesh_devices_24h: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/mesh/relay", response_model=MeshSOSResponse)
async def relay_mesh_sos(
    payload: MeshSOSPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Relay an SOS message received via Bridgefy mesh network.

    This endpoint is called by devices that received an SOS via Bluetooth mesh
    and have internet connectivity to forward it to the backend.

    Deduplication is performed using the message_id to prevent duplicate SOS entries
    when multiple devices relay the same message.
    """
    # Check for duplicate using mesh_message_id
    existing = await db.execute(
        select(SosRequest).where(SosRequest.mesh_message_id == payload.message_id)
    )
    existing_sos = existing.scalar_one_or_none()

    if existing_sos:
        logger.info("Duplicate mesh SOS relay ignored: %s", payload.message_id)
        return MeshSOSResponse(
            success=True,
            sos_id=str(existing_sos.id),
            message_id=payload.message_id,
            is_duplicate=True,
            message="SOS already received via another relay",
        )

    # Validate patient exists
    try:
        patient_uuid = UUID(payload.patient_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid patient_id format",
        )

    patient = await patient_service.get_patient(db, patient_uuid)
    if patient is None:
        logger.warning("Mesh SOS relay for unknown patient: %s", payload.patient_id)
        # Still accept the SOS but log warning - in emergency, don't reject
        pass

    # Parse patient status
    try:
        patient_status_enum = PatientStatus(payload.patient_status.lower()) if payload.patient_status else PatientStatus.INJURED
    except ValueError:
        patient_status_enum = PatientStatus.INJURED

    # Create SOS request
    sos = await patient_service.create_sos_request(
        db,
        patient_id=patient_uuid,
        latitude=payload.latitude,
        longitude=payload.longitude,
        patient_status=patient_status_enum,
        severity=payload.severity,
        source=SOSSource.MESH,
        details=payload.details,
    )

    # Update mesh-specific fields
    sos.mesh_message_id = payload.message_id
    sos.mesh_relay_device_id = payload.relay_device_id
    sos.mesh_hop_count = payload.hop_count
    sos.mesh_relay_timestamp = datetime.utcnow()

    # If original timestamp provided, we could store it for latency analysis
    if payload.original_timestamp:
        # Store in details or a separate field for analytics
        original_time = datetime.utcfromtimestamp(payload.original_timestamp)
        latency_seconds = (sos.mesh_relay_timestamp - original_time).total_seconds()
        logger.info(
            "Mesh SOS relay latency: %.1f seconds, %d hops",
            latency_seconds,
            payload.hop_count or 0,
        )

    await db.flush()

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=str(sos.id),
        user_id=current_user.id,
        details=f"Mesh SOS relay: hops={payload.hop_count}, device={payload.relay_device_id}",
        request=request,
        db=db,
    )

    # Increment patient's SOS count for trust tracking
    if patient:
        try:
            from sqlalchemy import select as sa_select
            from app.models.patient import Patient as PatientModel
            p_result = await db.execute(sa_select(PatientModel).where(PatientModel.id == patient_uuid))
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
        "mesh_hop_count": sos.mesh_hop_count,
        "mesh_relay_device_id": sos.mesh_relay_device_id,
        "patient_trust_score": patient.get("trust_score", 1.0) if patient else 1.0,
        "patient_info": {
            "name": patient.get("name"),
            "phone": patient.get("phone"),
            "blood_type": patient.get("blood_type"),
            "mobility": patient.get("mobility"),
            "gender": patient.get("gender"),
            "chronic_conditions": patient.get("chronic_conditions", []),
            "allergies": patient.get("allergies", []),
            "trust_score": patient.get("trust_score", 1.0),
        } if patient else None,
    }
    await broadcast_sos(sos_payload)

    # Trigger AI triage
    try:
        from tasks.sos_tasks import triage_sos_request
        triage_sos_request.delay(sos_payload)
    except Exception as exc:
        logger.warning("Could not enqueue mesh SOS triage task: %s", exc)

    logger.info(
        "Mesh SOS relay accepted: sos_id=%s, message_id=%s, hops=%d",
        sos.id,
        payload.message_id,
        payload.hop_count or 0,
    )

    return MeshSOSResponse(
        success=True,
        sos_id=str(sos.id),
        message_id=payload.message_id,
        is_duplicate=False,
        message="SOS relayed successfully via mesh network",
    )


@router.post("/mesh/ack", response_model=MeshAckResponse)
async def acknowledge_mesh_delivery(
    payload: MeshAckRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Acknowledge SOS delivery for mesh relay confirmation.

    This endpoint is called when a device confirms that an SOS or its acknowledgment
    has been delivered (either to the backend or back to the original sender).
    """
    await log_audit(
        action="update",
        resource="mesh_ack",
        resource_id=payload.message_id,
        user_id=current_user.id,
        details=f"Mesh ack: delivered_to={payload.delivered_to}, device={payload.relay_device_id}",
        request=request,
        db=db,
    )

    # If we have an sos_id, we could update the SOS with delivery confirmation
    if payload.sos_id:
        try:
            sos_uuid = UUID(payload.sos_id)
            result = await db.execute(select(SosRequest).where(SosRequest.id == sos_uuid))
            sos = result.scalar_one_or_none()
            if sos and payload.delivered_to == "backend":
                # SOS confirmed delivered to backend
                logger.info("Mesh SOS delivery confirmed: %s", payload.sos_id)
        except Exception as e:
            logger.warning("Error processing mesh ack: %s", e)

    return MeshAckResponse(
        success=True,
        message="Acknowledgment received",
    )


@router.post("/mesh/heartbeat", response_model=MeshHeartbeatResponse)
async def mesh_device_heartbeat(
    payload: MeshHeartbeatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Device heartbeat for mesh network monitoring.

    Devices periodically report their status to help track mesh network health
    and device distribution for coverage analysis.
    """
    # Log heartbeat (could be stored in Redis or a dedicated table for real-time monitoring)
    logger.debug(
        "Mesh heartbeat: device=%s, user=%s, nearby=%d, internet=%s",
        payload.device_id,
        payload.user_id,
        payload.nearby_device_count,
        payload.is_connected_to_internet,
    )

    # Update patient's location if user_id provided
    if payload.user_id and payload.latitude and payload.longitude:
        try:
            patient_uuid = UUID(payload.user_id)
            await patient_service.update_patient_location(
                db,
                patient_uuid,
                payload.latitude,
                payload.longitude,
            )
        except Exception:
            pass  # Non-critical

    return MeshHeartbeatResponse(
        success=True,
        server_time=datetime.utcnow().isoformat(),
    )


@router.get("/mesh/stats", response_model=MeshStatsResponse)
async def get_mesh_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get mesh network statistics.

    Provides analytics on mesh network usage for monitoring and optimization.
    """
    from datetime import timedelta

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = datetime.utcnow() - timedelta(hours=24)

    # Total mesh SOS count
    total_result = await db.execute(
        select(func.count(SosRequest.id)).where(SosRequest.source == SOSSource.MESH)
    )
    total_mesh_sos = total_result.scalar() or 0

    # Today's mesh SOS count
    today_result = await db.execute(
        select(func.count(SosRequest.id)).where(
            SosRequest.source == SOSSource.MESH,
            SosRequest.created_at >= today_start,
        )
    )
    mesh_sos_today = today_result.scalar() or 0

    # Average hop count
    avg_hops_result = await db.execute(
        select(func.avg(SosRequest.mesh_hop_count)).where(
            SosRequest.source == SOSSource.MESH,
            SosRequest.mesh_hop_count.isnot(None),
        )
    )
    average_hop_count = avg_hops_result.scalar() or 0.0

    # Unique relay devices (all time)
    unique_devices_result = await db.execute(
        select(func.count(func.distinct(SosRequest.mesh_relay_device_id))).where(
            SosRequest.source == SOSSource.MESH,
            SosRequest.mesh_relay_device_id.isnot(None),
        )
    )
    unique_relay_devices = unique_devices_result.scalar() or 0

    # Active devices in last 24h (based on relays)
    active_devices_result = await db.execute(
        select(func.count(func.distinct(SosRequest.mesh_relay_device_id))).where(
            SosRequest.source == SOSSource.MESH,
            SosRequest.mesh_relay_device_id.isnot(None),
            SosRequest.mesh_relay_timestamp >= yesterday,
        )
    )
    active_mesh_devices_24h = active_devices_result.scalar() or 0

    await log_audit(
        action="read",
        resource="mesh_stats",
        user_id=current_user.id,
        details="Mesh stats requested",
        request=request,
        db=db,
    )

    return MeshStatsResponse(
        total_mesh_sos=total_mesh_sos,
        mesh_sos_today=mesh_sos_today,
        average_hop_count=round(average_hop_count, 2),
        unique_relay_devices=unique_relay_devices,
        active_mesh_devices_24h=active_mesh_devices_24h,
    )
