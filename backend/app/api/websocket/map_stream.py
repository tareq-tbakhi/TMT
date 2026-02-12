"""
Live Map WebSocket stream handler.
Aggregates geo events from all sources and pushes to map clients.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geo_event import GeoEvent
from app.api.websocket.handler import sio


async def get_recent_map_events(db: AsyncSession, hours: int = 24) -> list[dict]:
    """Get all geo events from the last N hours for initial map load."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(GeoEvent)
        .where(GeoEvent.created_at >= cutoff)
        .order_by(GeoEvent.created_at.desc())
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "source": e.source.value if e.source else None,
            "severity": e.severity,
            "title": e.title,
            "details": e.details,
            "layer": e.layer,
            "metadata": e.metadata_,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@sio.event
async def request_map_events(sid, data=None):
    """Client requests initial batch of map events."""
    # This would need DB access — handled via REST endpoint instead
    await sio.emit("map_info", {"message": "Use GET /api/v1/map/events for initial load"}, to=sid)
