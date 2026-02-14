"""
Analytics API routes.

Endpoints:
    GET /analytics/stats    — Dashboard summary statistics
    GET /analytics/heatmap  — Heatmap data (query: type, timerange)
    GET /analytics/timeline — Casualty / incident timeline data
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.api.middleware.auth import get_current_user
from app.api.middleware.audit import log_audit
from app.services import analytics_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class DashboardStats(BaseModel):
    total_patients: int = 0
    total_hospitals: int = 0
    operational_hospitals: int = 0
    active_alerts: int = 0
    pending_sos: int = 0
    resolved_sos_today: int = 0
    created_sos_today: int = 0
    critical_alerts: int = 0
    patients_at_risk: int = 0

    model_config = ConfigDict(from_attributes=True)


class HeatmapPoint(BaseModel):
    latitude: float
    longitude: float
    intensity: float = 1.0
    event_type: Optional[str] = None


class HeatmapResponse(BaseModel):
    points: list[HeatmapPoint]
    type: str
    timerange_hours: int
    generated_at: datetime


class TimelineEntry(BaseModel):
    timestamp: datetime
    count: int
    event_type: Optional[str] = None
    severity: Optional[str] = None


class TimelineResponse(BaseModel):
    entries: list[TimelineEntry]
    timerange_hours: int
    bucket_size_minutes: int
    generated_at: datetime


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/analytics/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get dashboard summary statistics. Available to any authenticated user."""
    stats = await analytics_service.get_dashboard_stats(db)

    await log_audit(
        action="read",
        resource="analytics",
        user_id=current_user.id,
        details="Dashboard stats accessed",
        request=request,
        db=db,
    )

    return stats


@router.get("/analytics/heatmap", response_model=HeatmapResponse)
async def get_heatmap_data(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    type: str = Query(
        default="all",
        description="Heatmap type: 'sos', 'alerts', 'patients', 'all'",
    ),
    timerange: int = Query(
        default=24,
        ge=1,
        le=720,
        description="Timerange in hours (1-720)",
    ),
):
    """
    Get heatmap data points for visualization.
    Supports filtering by event type and time range.
    """
    valid_types = {"sos", "alerts", "patients", "all"}
    if type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid heatmap type. Must be one of: {valid_types}",
        )

    points = await analytics_service.get_heatmap_data(
        db,
        heatmap_type=type,
        timerange_hours=timerange,
    )

    await log_audit(
        action="read",
        resource="analytics",
        user_id=current_user.id,
        details=f"Heatmap data accessed (type={type}, hours={timerange})",
        request=request,
        db=db,
    )

    return HeatmapResponse(
        points=[HeatmapPoint(**p) for p in points],
        type=type,
        timerange_hours=timerange,
        generated_at=datetime.utcnow(),
    )


@router.get("/analytics/timeline", response_model=TimelineResponse)
async def get_casualty_timeline(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    timerange: int = Query(
        default=24,
        ge=1,
        le=720,
        description="Timerange in hours (1-720)",
    ),
    bucket_size: int = Query(
        default=60,
        ge=15,
        le=1440,
        description="Bucket size in minutes (15-1440)",
    ),
):
    """
    Get a timeline of incidents / casualties bucketed over time.
    Used for trend charts on the dashboard.
    """
    entries = await analytics_service.get_casualty_timeline(
        db,
        days=max(1, timerange // 24),
        bucket="hour" if bucket_size < 720 else "day",
    )

    await log_audit(
        action="read",
        resource="analytics",
        user_id=current_user.id,
        details=f"Timeline data accessed (hours={timerange}, bucket={bucket_size}min)",
        request=request,
        db=db,
    )

    return TimelineResponse(
        entries=[TimelineEntry(**e) for e in entries],
        timerange_hours=timerange,
        bucket_size_minutes=bucket_size,
        generated_at=datetime.utcnow(),
    )
