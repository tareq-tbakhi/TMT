"""
Live-map service — geo-event aggregation, time/layer filtering, server-side
clustering, and WebSocket push.

Every mutation that creates spatial data (SOS, alert, hospital status change,
Telegram intel) should funnel through ``create_geo_event`` so the live map
stays in sync.
"""

from __future__ import annotations

import logging
import math
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geo_event import GeoEvent, GeoEventSource
from app.api.websocket.handler import broadcast_map_event

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _geo_event_to_dict(event: GeoEvent) -> dict[str, Any]:
    return {
        "id": str(event.id),
        "event_type": event.event_type,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "source": event.source.value if event.source else None,
        "severity": event.severity,
        "title": event.title,
        "details": event.details,
        "metadata": event.metadata_,
        "layer": event.layer,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "expires_at": event.expires_at.isoformat() if event.expires_at else None,
    }


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

async def create_geo_event(
    db: AsyncSession,
    *,
    event_type: str,
    latitude: float,
    longitude: float,
    source: str | GeoEventSource,
    layer: str,
    severity: int = 1,
    title: str | None = None,
    details: str | None = None,
    metadata: dict[str, Any] | None = None,
    expires_hours: int | None = None,
    broadcast: bool = True,
) -> dict[str, Any]:
    """Insert a new geo event and optionally broadcast to live-map clients.

    Parameters
    ----------
    event_type
        Free-form type string (``"crisis"``, ``"sos"``, ``"hospital_status"``
        etc.).
    source
        One of ``GeoEventSource`` enum values.
    layer
        Map layer identifier (``"sos"``, ``"crisis"``, ``"hospital"``,
        ``"sms_activity"``, ``"patient_density"``, ``"telegram_intel"``).
    """
    if isinstance(source, str):
        source = GeoEventSource(source)

    event = GeoEvent(
        id=uuid.uuid4(),
        event_type=event_type,
        latitude=latitude,
        longitude=longitude,
        location=_make_point(longitude, latitude),
        source=source,
        severity=max(1, min(5, severity)),
        title=title,
        details=details,
        metadata_=metadata or {},
        layer=layer,
        expires_at=(
            datetime.utcnow() + timedelta(hours=expires_hours) if expires_hours else None
        ),
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)

    payload = _geo_event_to_dict(event)

    if broadcast:
        try:
            await broadcast_map_event(payload)
        except Exception:
            logger.exception("Failed to broadcast geo event %s", event.id)

    logger.info("Created geo event %s [%s/%s]", event.id, event_type, layer)
    return payload


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

async def get_map_events(
    db: AsyncSession,
    *,
    hours: int = 24,
    layers: list[str] | None = None,
    source: str | GeoEventSource | None = None,
    min_severity: int | None = None,
    limit: int = 1000,
    offset: int = 0,
    include_expired: bool = False,
) -> list[dict[str, Any]]:
    """Return geo events for initial map load with time and layer filters.

    Parameters
    ----------
    hours
        How far back to look (default 24 h).
    layers
        Optional list of layer names to include (e.g. ``["sos", "crisis"]``).
    include_expired
        When ``False`` (default) events whose ``expires_at`` is in the past
        are excluded.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    now = datetime.utcnow()

    query = (
        select(GeoEvent)
        .where(GeoEvent.created_at >= cutoff)
        .order_by(GeoEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if layers:
        query = query.where(GeoEvent.layer.in_(layers))

    if source is not None:
        if isinstance(source, str):
            source = GeoEventSource(source)
        query = query.where(GeoEvent.source == source)

    if min_severity is not None:
        query = query.where(GeoEvent.severity >= min_severity)

    if not include_expired:
        query = query.where(
            (GeoEvent.expires_at.is_(None)) | (GeoEvent.expires_at > now)
        )

    result = await db.execute(query)
    return [_geo_event_to_dict(e) for e in result.scalars().all()]


async def get_events_by_layer(
    db: AsyncSession,
    layer: str,
    *,
    hours: int = 24,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Shorthand — get events for a single layer."""
    return await get_map_events(db, hours=hours, layers=[layer], limit=limit)


async def get_event(db: AsyncSession, event_id: uuid.UUID) -> dict[str, Any] | None:
    result = await db.execute(select(GeoEvent).where(GeoEvent.id == event_id))
    event = result.scalar_one_or_none()
    return _geo_event_to_dict(event) if event else None


async def get_events_in_area(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_m: float = 10_000,
    *,
    hours: int = 24,
    layers: list[str] | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """Return geo events within *radius_m* metres of a point."""
    centre = _make_point(longitude, latitude)
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    now = datetime.utcnow()

    query = (
        select(GeoEvent)
        .where(
            GeoEvent.location.isnot(None),
            GeoEvent.created_at >= cutoff,
            (GeoEvent.expires_at.is_(None)) | (GeoEvent.expires_at > now),
            func.ST_DWithin(
                GeoEvent.location.cast(func.Geography),
                centre.cast(func.Geography),
                radius_m,
            ),
        )
        .order_by(GeoEvent.created_at.desc())
        .limit(limit)
    )

    if layers:
        query = query.where(GeoEvent.layer.in_(layers))

    result = await db.execute(query)
    return [_geo_event_to_dict(e) for e in result.scalars().all()]


# ---------------------------------------------------------------------------
# Server-side clustering
# ---------------------------------------------------------------------------

def _geohash_bucket(lat: float, lon: float, precision: float) -> tuple[int, int]:
    """Map a coordinate pair to a grid cell.

    *precision* is the cell size in degrees.  A value of ~0.01 (~1 km at the
    equator) works well for city-level maps; 0.1 (~10 km) for regional views.
    """
    return (int(lat / precision), int(lon / precision))


async def cluster_events(
    db: AsyncSession,
    *,
    hours: int = 24,
    layers: list[str] | None = None,
    precision_deg: float = 0.01,
    min_cluster_size: int = 1,
) -> list[dict[str, Any]]:
    """Server-side grid-based clustering of geo events.

    Returns a list of clusters, each with:
    - ``latitude``, ``longitude`` — centroid
    - ``count`` — number of events in the cluster
    - ``max_severity`` — highest severity in the cluster
    - ``event_ids`` — list of event IDs (up to 50 per cluster)
    - ``layers`` — set of layers present
    - ``bounds`` — bounding box ``{min_lat, max_lat, min_lon, max_lon}``

    This approach avoids pulling all points to the frontend when the map is
    zoomed out.  The *precision_deg* parameter controls the grid cell size.
    """
    events = await get_map_events(db, hours=hours, layers=layers, limit=5000)

    buckets: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for e in events:
        if e["latitude"] is not None and e["longitude"] is not None:
            key = _geohash_bucket(e["latitude"], e["longitude"], precision_deg)
            buckets[key].append(e)

    clusters: list[dict[str, Any]] = []
    for _key, group in buckets.items():
        if len(group) < min_cluster_size:
            continue

        lats = [e["latitude"] for e in group]
        lons = [e["longitude"] for e in group]
        severities = [e["severity"] or 1 for e in group]
        layer_set = {e["layer"] for e in group if e["layer"]}

        clusters.append({
            "latitude": sum(lats) / len(lats),
            "longitude": sum(lons) / len(lons),
            "count": len(group),
            "max_severity": max(severities),
            "avg_severity": round(sum(severities) / len(severities), 2),
            "event_ids": [e["id"] for e in group[:50]],
            "layers": sorted(layer_set),
            "bounds": {
                "min_lat": min(lats),
                "max_lat": max(lats),
                "min_lon": min(lons),
                "max_lon": max(lons),
            },
        })

    # Sort clusters by count descending so the frontend can prioritise
    clusters.sort(key=lambda c: c["count"], reverse=True)
    return clusters


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

async def purge_expired_events(db: AsyncSession) -> int:
    """Delete geo events whose ``expires_at`` has passed.

    Returns the number of rows removed.  Intended to be called from a periodic
    background task.
    """
    from sqlalchemy import delete as sa_delete
    now = datetime.utcnow()
    result = await db.execute(
        sa_delete(GeoEvent).where(
            GeoEvent.expires_at.isnot(None),
            GeoEvent.expires_at < now,
        )
    )
    count = result.rowcount
    if count:
        await db.flush()
        logger.info("Purged %d expired geo events", count)
    return count


# ---------------------------------------------------------------------------
# Layer summary (for map legend / controls)
# ---------------------------------------------------------------------------

async def get_layer_summary(
    db: AsyncSession,
    *,
    hours: int = 24,
) -> list[dict[str, Any]]:
    """Return per-layer event counts and latest-event timestamps.

    Useful for the map sidebar/legend to show which layers have active data.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    now = datetime.utcnow()

    query = (
        select(
            GeoEvent.layer,
            func.count(GeoEvent.id).label("event_count"),
            func.max(GeoEvent.created_at).label("latest_event"),
            func.max(GeoEvent.severity).label("max_severity"),
        )
        .where(
            GeoEvent.created_at >= cutoff,
            (GeoEvent.expires_at.is_(None)) | (GeoEvent.expires_at > now),
        )
        .group_by(GeoEvent.layer)
        .order_by(func.count(GeoEvent.id).desc())
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "layer": row.layer,
            "event_count": row.event_count,
            "latest_event": row.latest_event.isoformat() if row.latest_event else None,
            "max_severity": row.max_severity,
        }
        for row in rows
    ]
