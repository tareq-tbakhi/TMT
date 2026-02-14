"""Celery tasks for Telegram message processing."""
import asyncio
import logging
import shutil
from pathlib import Path

import socketio

from tasks.celery_app import celery_app
from app.config import get_settings

logger = logging.getLogger(__name__)

# Write-only Socket.IO Redis manager — lets Celery workers emit events
# through the same Redis bus the ASGI server listens on.
_sio_settings = get_settings()
_external_sio = socketio.RedisManager(_sio_settings.REDIS_URL, write_only=True)


def _run_async(coro):
    """Helper to run async functions in Celery sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _make_session():
    """Create a fresh async engine + session for this Celery task.

    Each _run_async() call uses a new event loop, but asyncpg connections
    are bound to the loop they were created on.  Re-using the global engine
    from app.db.postgres causes 'another operation is in progress' errors,
    so we create a disposable engine here instead.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.config import get_settings

    settings = get_settings()
    eng = create_async_engine(settings.DATABASE_URL, pool_size=2, max_overflow=0)
    factory = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    return eng, factory


def _worker_session_name() -> str:
    """Copy the main session file to a worker-specific copy so the Celery
    worker doesn't lock the backend's Telethon session file."""
    src = Path("tmt_session.session")
    dst = Path("tmt_session_worker.session")
    if src.exists():
        shutil.copy2(src, dst)
    return "tmt_session_worker"


def _severity_to_int(severity) -> int:
    """Convert severity string or int to integer 1-5."""
    if isinstance(severity, int):
        return max(1, min(5, severity))
    mapping = {"low": 1, "medium": 2, "high": 3, "critical": 4, "extreme": 5}
    return mapping.get(str(severity).lower(), 2)


@celery_app.task(name="tasks.telegram_tasks.fetch_and_process_messages")
def fetch_and_process_messages():
    """Fetch recent messages from all monitored channels and process them.

    Queries active channels from the database (not the in-memory registry,
    which is empty in the Celery worker process).
    """
    from app.telegram.client import get_telegram_client, get_channel_messages
    from app.telegram.message_processor import process_batch
    from app.models.telegram_channel import TelegramChannel
    from sqlalchemy import select

    # Use a separate session file so we don't lock the backend's real-time listener
    worker_session = _worker_session_name()

    async def _run():
        eng, Session = _make_session()
        try:
            # Ensure the worker uses its own Telegram session
            await get_telegram_client(session_name=worker_session)

            async with Session() as db:
                result = await db.execute(
                    select(TelegramChannel.channel_id).where(
                        TelegramChannel.monitoring_status == "active"
                    )
                )
                channel_ids = [row[0] for row in result.all()]

            if not channel_ids:
                logger.info("No active channels in DB, nothing to fetch")
                return 0

            all_messages = []
            for ch_id in channel_ids:
                msgs = await get_channel_messages(ch_id, limit=20)
                all_messages.extend(msgs)
                await asyncio.sleep(2)

            logger.info(f"Fetched {len(all_messages)} messages from {len(channel_ids)} Telegram channels")
            results = await process_batch(all_messages)
            for r in results:
                await _store_geo_event_with_session(Session, r)
            logger.info(f"Processed {len(results)} crisis events")
            return len(results)
        finally:
            await eng.dispose()

    return _run_async(_run())


@celery_app.task(name="tasks.telegram_tasks.process_single_message")
def process_single_message(message_data: dict):
    """Process a single incoming Telegram message through AI and store results."""
    from app.telegram.message_processor import process_message

    msg_id = message_data.get("id")
    chat_id = message_data.get("chat_id")
    channel = message_data.get("channel")
    channel_name = message_data.get("channel_name")

    async def _run():
        eng, Session = _make_session()
        try:
            result = await process_message(message_data)
            if result:
                await _store_geo_event_with_session(Session, result)
                sev = _severity_to_int(result.get("severity", "medium"))
                if sev >= 3:
                    create_alert_from_crisis.delay(result)

                # Broadcast the decision to connected dashboards
                _external_sio.emit("telegram_analysis", {
                    "message_id": msg_id,
                    "chat_id": chat_id,
                    "channel": channel,
                    "channel_name": channel_name,
                    "is_crisis": True,
                    "event_type": result.get("event_type", "other"),
                    "severity": result.get("severity", "medium"),
                    "confidence": result.get("confidence", 0.5),
                    "details": result.get("details"),
                    "latitude": result.get("latitude"),
                    "longitude": result.get("longitude"),
                    "original_text": result.get("original_text", ""),
                    "status": "completed",
                }, room="telegram")
            else:
                # Not a crisis — still notify the dashboard
                _external_sio.emit("telegram_analysis", {
                    "message_id": msg_id,
                    "chat_id": chat_id,
                    "channel": channel,
                    "channel_name": channel_name,
                    "is_crisis": False,
                    "original_text": (message_data.get("text") or "")[:200],
                    "status": "completed",
                }, room="telegram")

            return result
        finally:
            await eng.dispose()

    return _run_async(_run())


async def _store_geo_event_with_session(Session, crisis_data: dict):
    """Store a processed crisis event as a GeoEvent using the given session factory."""
    from app.models.geo_event import GeoEvent, GeoEventSource

    lat = crisis_data.get("latitude")
    lon = crisis_data.get("longitude")
    if lat is None:
        lat = 31.5017
    if lon is None:
        lon = 34.4668

    async with Session() as db:
        try:
            event = GeoEvent(
                event_type=crisis_data.get("event_type", "other"),
                latitude=lat,
                longitude=lon,
                source=GeoEventSource.TELEGRAM,
                severity=_severity_to_int(crisis_data.get("severity", "medium")),
                title=(crisis_data.get("details") or "")[:120] or f"Crisis: {crisis_data.get('event_type', 'unknown')}",
                details=crisis_data.get("details"),
                metadata_={
                    "channel": crisis_data.get("channel"),
                    "confidence": crisis_data.get("confidence"),
                    "original_text": crisis_data.get("original_text"),
                    "message_id": crisis_data.get("message_id"),
                },
                layer="telegram_intel",
            )
            db.add(event)
            await db.commit()
            logger.info(f"Stored GeoEvent: {event.event_type} (severity {event.severity})")
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to store GeoEvent: {e}")


@celery_app.task(name="tasks.telegram_tasks.run_gap_detection")
def run_gap_detection():
    """Run knowledge gap detection cycle."""
    from app.services.ai_agent.gap_detector import run_gap_detection_cycle

    return _run_async(run_gap_detection_cycle())


@celery_app.task(name="tasks.telegram_tasks.create_alert_from_crisis")
def create_alert_from_crisis(crisis_data: dict):
    """Create an alert from processed Telegram crisis data."""
    logger.info(f"Creating alert from crisis data: {crisis_data.get('event_type')}")

    async def _run():
        from app.services.alert_service import create_alert

        eng, Session = _make_session()
        try:
            event_type = crisis_data.get("event_type", "other")
            lat = crisis_data.get("latitude")
            lon = crisis_data.get("longitude")

            if lat is None or lon is None:
                lat = lat or 31.5017
                lon = lon or 34.4668

            async with Session() as db:
                try:
                    alert = await create_alert(
                        db,
                        event_type=event_type,
                        latitude=lat,
                        longitude=lon,
                        title=crisis_data.get("title", f"Crisis Alert — {event_type}"),
                        details=crisis_data.get("details"),
                        source="telegram",
                        confidence=crisis_data.get("confidence", 0.5),
                        severity_override=crisis_data.get("severity"),
                        metadata=crisis_data.get("metadata", {}),
                        broadcast=True,
                        notify_patients=True,
                    )
                    await db.commit()
                    logger.info("Alert created from Telegram crisis: %s", alert.get("id"))
                    return alert
                except Exception as e:
                    await db.rollback()
                    logger.exception("Failed to create alert from crisis: %s", e)
                    return None
        finally:
            await eng.dispose()

    return _run_async(_run())
