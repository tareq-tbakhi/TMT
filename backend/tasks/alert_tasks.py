"""Celery tasks for alert processing and analytics."""
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


@celery_app.task(name="tasks.alert_tasks.broadcast_new_alert")
def broadcast_new_alert(alert_data: dict):
    """Broadcast a new alert to all connected WebSocket clients."""
    from app.api.websocket.handler import broadcast_alert, broadcast_map_event

    async def _run():
        await broadcast_alert(alert_data)
        # Also push to Live Map
        if alert_data.get("latitude") and alert_data.get("longitude"):
            await broadcast_map_event({
                "type": "crisis",
                "data": alert_data,
            })

    _run_async(_run())


@celery_app.task(name="tasks.alert_tasks.notify_affected_patients")
def notify_affected_patients(alert_id: str, patient_ids: list[str]):
    """Send alerts to patients in the affected area."""
    from app.api.websocket.handler import notify_patient

    async def _run():
        for pid in patient_ids:
            await notify_patient(pid, {"alert_id": alert_id, "type": "crisis_in_area"})

    _run_async(_run())


@celery_app.task(name="tasks.alert_tasks.refresh_analytics_cache")
def refresh_analytics_cache():
    """Refresh cached analytics data in Redis."""
    logger.info("Refreshing analytics cache")
    # Would recalculate and cache dashboard stats
