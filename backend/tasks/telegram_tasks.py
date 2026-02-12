"""Celery tasks for Telegram message processing."""
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


@celery_app.task(name="tasks.telegram_tasks.fetch_and_process_messages")
def fetch_and_process_messages():
    """Fetch recent messages from all monitored channels and process them."""
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
            # Trigger alert creation
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
    """Create an alert from processed crisis data."""
    logger.info(f"Creating alert from crisis data: {crisis_data.get('event_type')}")
    # This would create an alert via the alert service
    # Requires DB session — handled in the async context
