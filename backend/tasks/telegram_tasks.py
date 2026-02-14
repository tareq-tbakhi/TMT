"""Celery tasks for Telegram message processing.

Uses CrewAI Intel Agent for monitoring, with fallback to direct pipeline.
"""
import asyncio
import logging

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Helper to run async functions in Celery sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.telegram_tasks.fetch_and_process_messages",
                 time_limit=600, soft_time_limit=570)
def fetch_and_process_messages():
    """Fetch and process Telegram messages — CrewAI intel crew or direct pipeline."""

    # Try CrewAI first
    try:
        from app.services.ai_agent.crews import build_intel_crew
        from app.config import get_settings

        settings = get_settings()
        if not settings.GLM_API_KEY:
            raise RuntimeError("No LLM API key")

        crew = build_intel_crew()
        result = crew.kickoff()
        logger.info("CrewAI intel crew completed: %s", str(result.raw)[:200])
        return result.raw

    except Exception as e:
        logger.warning("CrewAI intel crew failed, using direct pipeline: %s", e)

    # Fallback: direct pipeline
    from app.telegram.channel_manager import fetch_recent_messages
    from app.telegram.message_processor import process_batch

    async def _run():
        messages = await fetch_recent_messages(limit_per_channel=20)
        logger.info(f"Fetched {len(messages)} messages from Telegram channels")
        results = await process_batch(messages)
        logger.info(f"Processed {len(results)} crisis events")
        return len(results)

    return _run_async(_run())


@celery_app.task(name="tasks.telegram_tasks.process_single_message")
def process_single_message(message_data: dict):
    """Process a single incoming Telegram message."""
    from app.telegram.message_processor import process_message

    async def _run():
        result = await process_message(message_data)
        if result:
            create_alert_from_crisis.delay(result)
        return result

    return _run_async(_run())


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
        from app.db.postgres import async_session

        event_type = crisis_data.get("event_type", "other")
        lat = crisis_data.get("latitude")
        lon = crisis_data.get("longitude")

        if lat is None or lon is None:
            lat = lat or 31.5017
            lon = lon or 34.4668

        async with async_session() as db:
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

    return _run_async(_run())
