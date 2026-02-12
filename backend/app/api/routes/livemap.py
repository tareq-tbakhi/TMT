"""
Live Map API routes.

Endpoints:
    GET /map/events — Get recent geo events for the Live Map (query: hours, layer, severity)
    GET /map/layers — Get available map layers
    GET /map/stream — Server-Sent Events stream for real-time map updates
"""

import asyncio
import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.geo_event import GeoEventSource
from app.api.middleware.auth import get_current_user
from app.api.middleware.audit import log_audit
from app.services import livemap_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class GeoEventResponse(BaseModel):
    id: UUID
    event_type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: Optional[str] = None
    severity: int = 1
    title: Optional[str] = None
    details: Optional[str] = None
    layer: str
    metadata_: Optional[dict] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class GeoEventListResponse(BaseModel):
    events: list[GeoEventResponse]
    total: int
    hours: int
    generated_at: datetime


class MapLayerInfo(BaseModel):
    id: str
    name: str
    description: str
    color: str
    icon: str
    default_enabled: bool = True


class MapLayersResponse(BaseModel):
    layers: list[MapLayerInfo]


# ---------------------------------------------------------------------------
# Available layers definition
# ---------------------------------------------------------------------------

AVAILABLE_LAYERS: list[dict] = [
    {
        "id": "sos",
        "name": "SOS Requests",
        "description": "Active SOS distress signals from patients",
        "color": "#FF0000",
        "icon": "emergency",
        "default_enabled": True,
    },
    {
        "id": "crisis",
        "name": "Crisis Events",
        "description": "Bombings, earthquakes, fires, and other crisis events",
        "color": "#FF6600",
        "icon": "warning",
        "default_enabled": True,
    },
    {
        "id": "hospital",
        "name": "Hospitals",
        "description": "Hospital locations and operational status",
        "color": "#00AA00",
        "icon": "local_hospital",
        "default_enabled": True,
    },
    {
        "id": "sms_activity",
        "name": "SMS Activity",
        "description": "SMS-based SOS activity clusters",
        "color": "#9900CC",
        "icon": "sms",
        "default_enabled": False,
    },
    {
        "id": "patient_density",
        "name": "Patient Density",
        "description": "Registered patient density heatmap",
        "color": "#0066FF",
        "icon": "people",
        "default_enabled": False,
    },
    {
        "id": "telegram_intel",
        "name": "Telegram Intelligence",
        "description": "Events detected from Telegram channel monitoring",
        "color": "#FF9900",
        "icon": "radar",
        "default_enabled": True,
    },
]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/map/events", response_model=GeoEventListResponse)
async def get_map_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours (1-168)"),
    layer: Optional[str] = Query(default=None, description="Filter by layer ID"),
    severity: Optional[int] = Query(default=None, ge=1, le=5, description="Minimum severity (1-5)"),
):
    """
    Get recent geo events for the Live Map.
    Supports filtering by time window, map layer, and minimum severity.
    """
    # Validate layer if provided
    valid_layer_ids = {l["id"] for l in AVAILABLE_LAYERS}
    if layer and layer not in valid_layer_ids:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid layer. Must be one of: {valid_layer_ids}",
        )

    events = await livemap_service.get_map_events(
        db,
        hours=hours,
        layers=[layer] if layer else None,
        min_severity=severity,
    )

    await log_audit(
        action="read",
        resource="geo_event",
        user_id=current_user.id,
        details=f"Map events accessed (hours={hours}, layer={layer}, severity>={severity})",
        request=request,
        db=db,
    )

    return GeoEventListResponse(
        events=[GeoEventResponse.model_validate(e) for e in events],
        total=len(events),
        hours=hours,
        generated_at=datetime.utcnow(),
    )


@router.get("/map/layers", response_model=MapLayersResponse)
async def get_map_layers(
    current_user: User = Depends(get_current_user),
):
    """Get the list of available map layers and their configuration."""
    return MapLayersResponse(
        layers=[MapLayerInfo(**layer) for layer in AVAILABLE_LAYERS],
    )


@router.get("/map/stream")
async def stream_map_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Server-Sent Events stream for real-time map updates.
    Polls for new events every 5 seconds and pushes them to the client.
    Used as a fallback when WebSocket is unavailable.
    """
    async def event_generator():
        last_check = datetime.utcnow()
        while True:
            if await request.is_disconnected():
                break
            events = await livemap_service.get_map_events(db, hours=1)
            new_events = [
                e for e in events
                if e.created_at and e.created_at > last_check
            ]
            for event in new_events:
                data = json.dumps({
                    "id": str(event.id),
                    "event_type": event.event_type,
                    "latitude": event.latitude,
                    "longitude": event.longitude,
                    "source": event.source,
                    "severity": event.severity,
                    "title": event.title,
                    "details": event.details,
                    "layer": event.layer,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                })
                yield f"data: {data}\n\n"
            if new_events:
                last_check = datetime.utcnow()
            # Send heartbeat to keep connection alive
            yield ": heartbeat\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
