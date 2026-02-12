"""
Alert API routes.

Endpoints:
    POST /alerts                  — Create an alert (system / internal)
    GET  /alerts                  — List alerts for a coverage area (hospital)
    GET  /alerts/{id}             — Get alert detail
    PUT  /alerts/{id}/acknowledge — Acknowledge an alert (hospital_admin)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.alert import Alert, AlertSeverity, EventType
from app.api.middleware.auth import get_current_user, require_role
from app.api.middleware.audit import log_audit
from app.services import alert_service
from app.api.websocket.handler import broadcast_alert

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AlertCreateRequest(BaseModel):
    event_type: EventType
    severity: AlertSeverity
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_m: float = Field(default=1000, ge=0)
    title: str = Field(..., min_length=1, max_length=500)
    details: Optional[str] = None
    source: Optional[str] = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: Optional[dict] = None


class AlertAcknowledgeRequest(BaseModel):
    hospital_id: UUID


class AlertResponse(BaseModel):
    id: UUID
    event_type: EventType
    severity: AlertSeverity
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_m: Optional[float] = None
    title: str
    details: Optional[str] = None
    source: Optional[str] = None
    confidence: Optional[float] = None
    acknowledged: Optional[str] = None
    metadata_: Optional[dict] = Field(None, alias="metadata_")
    affected_patients_count: int = 0
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AlertListResponse(BaseModel):
    alerts: list[AlertResponse]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/alerts", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: AlertCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)),
):
    """Create a new alert. Typically called by system internals or hospital admins."""
    alert = await alert_service.create_alert(
        db,
        event_type=payload.event_type,
        severity_override=payload.severity,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_m=payload.radius_m,
        title=payload.title,
        details=payload.details,
        source=payload.source,
        confidence=payload.confidence,
        metadata=payload.metadata or {},
    )

    await log_audit(
        action="create",
        resource="alert",
        resource_id=str(alert["id"]),
        user_id=current_user.id,
        details=f"Alert created: {payload.title} ({payload.severity.value})",
        request=request,
        db=db,
    )

    # Note: create_alert service already broadcasts via WebSocket
    return alert


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    severity: Optional[AlertSeverity] = None,
    event_type: Optional[EventType] = None,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
):
    """
    List alerts, optionally filtered by severity and event type.
    For hospital users, returns alerts relevant to their coverage area.
    """
    hospital_id = current_user.hospital_id if current_user.role in (
        UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR
    ) else None

    alerts = await alert_service.get_alerts(
        db,
        severity=severity,
        event_type=event_type,
        active_only=active_only,
        limit=limit,
        offset=offset,
    )

    await log_audit(
        action="read",
        resource="alert",
        user_id=current_user.id,
        details=f"Listed alerts (severity={severity}, type={event_type}, active={active_only})",
        request=request,
        db=db,
    )

    return AlertListResponse(
        alerts=[AlertResponse.model_validate(a) for a in alerts],
        total=len(alerts),
    )


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single alert by ID."""
    alert = await alert_service.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    await log_audit(
        action="read",
        resource="alert",
        resource_id=str(alert_id),
        user_id=current_user.id,
        details="Alert detail accessed",
        request=request,
        db=db,
    )

    return alert


@router.put("/alerts/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: UUID,
    payload: AlertAcknowledgeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Acknowledge an alert as a hospital admin."""
    # Hospital admins can only acknowledge for their own hospital
    if current_user.hospital_id != payload.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only acknowledge alerts for your own hospital",
        )

    alert = await alert_service.acknowledge_alert(
        db,
        alert_id=alert_id,
        hospital_id=str(payload.hospital_id),
    )
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    await log_audit(
        action="update",
        resource="alert",
        resource_id=str(alert_id),
        user_id=current_user.id,
        details=f"Alert acknowledged by hospital {payload.hospital_id}",
        request=request,
        db=db,
    )

    return alert
