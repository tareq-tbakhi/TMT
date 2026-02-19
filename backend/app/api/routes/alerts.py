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
from app.models.user import User, UserRole, ROLE_TO_DEPARTMENT
from app.models.alert import Alert, AlertSeverity, EventType
from app.api.middleware.auth import get_current_user, require_role, require_any_department_admin
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
    routed_department: Optional[str] = None
    target_facility_id: Optional[UUID] = None


class AlertAcknowledgeRequest(BaseModel):
    facility_id: Optional[UUID] = None
    hospital_id: Optional[UUID] = None  # legacy alias


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
    metadata_: Optional[dict] = Field(None, alias="metadata")
    affected_patients_count: int = 0
    routed_department: Optional[str] = None
    target_facility_id: Optional[UUID] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AlertStatsResponse(BaseModel):
    total: int = 0
    sos_count: int = 0
    unacknowledged: int = 0
    by_severity: dict[str, int] = {}


class AlertListResponse(BaseModel):
    alerts: list[AlertResponse]
    total: int
    stats: AlertStatsResponse | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/alerts", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: AlertCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
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
        routed_department=payload.routed_department,
        target_facility_id=str(payload.target_facility_id) if payload.target_facility_id else None,
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
    source: Optional[str] = None,
    routed_department: Optional[str] = None,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
):
    """
    List alerts, optionally filtered by severity, event type, source, department.
    Department admins automatically see alerts for their department.
    Patients only see non-SOS crisis alerts (never other people's SOS data).
    Returns true total count and aggregate stats for the UI header.
    """
    # Auto-filter by department for non-super-admin users
    dept_filter = routed_department
    if current_user.role != UserRole.SUPER_ADMIN and dept_filter is None:
        dept_filter = current_user.department_type

    # SECURITY: Patients must never see SOS-sourced alerts (those contain other
    # patients' emergency data). They only see crisis/news alerts near them.
    exclude_src = None
    if current_user.role == UserRole.PATIENT:
        exclude_src = "sos"

    alerts = await alert_service.get_alerts(
        db,
        severity=severity,
        event_type=event_type,
        source=source,
        exclude_source=exclude_src,
        routed_department=dept_filter,
        active_only=active_only,
        limit=limit,
        offset=offset,
    )

    total = await alert_service.count_alerts(
        db,
        severity=severity,
        event_type=event_type,
        source=source,
        exclude_source=exclude_src,
        routed_department=dept_filter,
        active_only=active_only,
    )

    stats_data = await alert_service.get_alert_stats(db, active_only=active_only, routed_department=dept_filter)

    return AlertListResponse(
        alerts=[AlertResponse.model_validate(a) for a in alerts],
        total=total,
        stats=AlertStatsResponse(**stats_data),
    )


@router.get("/alerts/prioritized")
async def list_alerts_prioritized(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    severity: Optional[AlertSeverity] = None,
    event_type: Optional[EventType] = None,
    source: Optional[str] = None,
    routed_department: Optional[str] = None,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
):
    """
    List alerts sorted by AI-computed priority score (highest first).
    Supports severity, event_type, source, and department filters.
    Department admins automatically see only their department's alerts.
    Patients never see SOS-sourced alerts.
    Returns true total count and aggregate stats.
    """
    dept_filter = routed_department
    if current_user.role != UserRole.SUPER_ADMIN and dept_filter is None:
        dept_filter = current_user.department_type

    # SECURITY: Patients must never see SOS-sourced alerts
    exclude_src = None
    if current_user.role == UserRole.PATIENT:
        exclude_src = "sos"

    alerts = await alert_service.get_alerts_prioritized(
        db,
        severity=severity,
        event_type=event_type,
        source=source,
        exclude_source=exclude_src,
        routed_department=dept_filter,
        active_only=active_only,
        limit=limit,
        offset=offset,
    )

    total = await alert_service.count_alerts(
        db,
        severity=severity,
        event_type=event_type,
        source=source,
        exclude_source=exclude_src,
        routed_department=dept_filter,
        active_only=active_only,
    )

    stats_data = await alert_service.get_alert_stats(db, active_only=active_only, routed_department=dept_filter)

    return {
        "alerts": alerts,
        "total": total,
        "stats": stats_data,
        "sort": "priority_score_desc",
    }


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
    current_user: User = Depends(require_any_department_admin()),
):
    """Acknowledge an alert as any department admin."""
    # Resolve facility_id: explicit payload > current user's facility
    fac_id = payload.facility_id or payload.hospital_id or current_user.hospital_id
    if fac_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No facility associated with your account",
        )

    # Admins can only acknowledge for their own facility
    if current_user.hospital_id and fac_id != current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only acknowledge alerts for your own facility",
        )

    alert = await alert_service.acknowledge_alert(
        db,
        alert_id=alert_id,
        facility_id=fac_id,
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
        details=f"Alert acknowledged by facility {fac_id}",
        request=request,
        db=db,
    )

    return alert


# ---------------------------------------------------------------------------
# False-alarm reporting
# ---------------------------------------------------------------------------

class FalseAlarmReport(BaseModel):
    reason: Optional[str] = None


@router.put("/alerts/{alert_id}/report-false")
async def report_false_alarm(
    alert_id: UUID,
    payload: FalseAlarmReport,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Report an alert as a false alarm. Decreases the patient's trust score.

    This helps the AI agent weigh future SOS requests from this patient.
    """
    from app.models.patient import Patient
    from sqlalchemy import select as sa_select

    alert_data = await alert_service.get_alert(db, alert_id)
    if alert_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found",
        )

    # Mark alert as false alarm in metadata
    result = await db.execute(
        sa_select(Alert).where(Alert.id == alert_id)
    )
    alert_obj = result.scalar_one_or_none()
    if alert_obj is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    meta = dict(alert_obj.metadata_ or {})
    meta["reported_false"] = True
    meta["false_alarm_reason"] = payload.reason
    meta["reported_by"] = str(current_user.id)
    alert_obj.metadata_ = meta
    await db.flush()

    # Update patient trust score if this was an SOS-sourced alert
    patient_id_str = meta.get("patient_id")
    if patient_id_str:
        try:
            from uuid import UUID as UUIDType
            pid = UUIDType(patient_id_str)
            p_result = await db.execute(sa_select(Patient).where(Patient.id == pid))
            patient = p_result.scalar_one_or_none()
            if patient:
                patient.false_alarm_count = (patient.false_alarm_count or 0) + 1
                total = max(patient.total_sos_count or 1, 1)
                false_count = patient.false_alarm_count
                # Trust = 1 - (false / total), clamped to [0.1, 1.0]
                patient.trust_score = max(0.1, min(1.0, 1.0 - (false_count / total)))
                await db.flush()
        except Exception:
            pass  # Non-critical

    await log_audit(
        action="update",
        resource="alert",
        resource_id=str(alert_id),
        user_id=current_user.id,
        details=f"Reported false alarm: {payload.reason}",
        request=request,
        db=db,
    )

    return {"status": "reported", "alert_id": str(alert_id)}
