"""Celery tasks for Live Map event processing."""
import asyncio
import logging

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.map_tasks.push_map_event")
def push_map_event(event_data: dict):
    """Push a new geo event to all Live Map WebSocket clients."""
    from app.api.websocket.handler import broadcast_map_event

    async def _run():
        await broadcast_map_event(event_data)

    _run_async(_run())
    logger.info(f"Map event pushed: {event_data.get('type', 'unknown')}")


@celery_app.task(name="tasks.map_tasks.create_and_broadcast_geo_event")
def create_and_broadcast_geo_event(
    event_type: str,
    latitude: float,
    longitude: float,
    source: str,
    severity: int,
    layer: str,
    title: str = None,
    details: str = None,
    metadata: dict = None,
):
    """Create a geo event in DB and broadcast to Live Map clients."""
    logger.info(f"Creating geo event: {event_type} at ({latitude}, {longitude})")
    # Would create GeoEvent in DB and broadcast via WebSocket
    # Needs DB session — handled in async context

    push_map_event.delay({
        "type": layer,
        "data": {
            "event_type": event_type,
            "latitude": latitude,
            "longitude": longitude,
            "source": source,
            "severity": severity,
            "title": title,
            "details": details,
            "metadata": metadata,
        },
    })
