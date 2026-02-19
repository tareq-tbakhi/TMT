"""Shared Telegram message handler.

Called for every incoming message — persists it to the database,
broadcasts via Socket.IO, and queues AI processing.
"""
import logging
from datetime import datetime

from app.db.postgres import async_session
from app.models.telegram_message import TelegramMessage
from app.api.websocket.handler import broadcast_telegram_message, broadcast_telegram_processing

logger = logging.getLogger(__name__)


async def on_telegram_message(msg_data: dict):
    """Handle an incoming Telegram message end-to-end."""

    # 1) Persist to DB so the live feed survives reloads
    try:
        sent_at = msg_data.get("date")
        if isinstance(sent_at, str):
            # Accept ISO format from Telethon
            sent_at = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
        elif not isinstance(sent_at, datetime):
            sent_at = datetime.utcnow()

        async with async_session() as db:
            db.add(TelegramMessage(
                message_id=msg_data.get("id"),
                chat_id=msg_data.get("chat_id"),
                channel=msg_data.get("channel"),
                channel_name=msg_data.get("channel_name"),
                text=msg_data.get("text", ""),
                sent_at=sent_at,
            ))
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist Telegram message: {e}")

    # 2) Broadcast raw message to live feed via Socket.IO
    try:
        await broadcast_telegram_message(msg_data)
        logger.info("Broadcast telegram_message to Socket.IO room")
    except Exception as e:
        logger.warning(f"Socket.IO broadcast failed: {e}")

    # 3) Queue AI classification via Celery
    try:
        from tasks.telegram_tasks import process_single_message
        process_single_message.delay(msg_data)

        # Notify dashboards that AI processing has started for this message
        await broadcast_telegram_processing({
            "message_id": msg_data.get("id"),
            "chat_id": msg_data.get("chat_id"),
            "channel": msg_data.get("channel"),
            "channel_name": msg_data.get("channel_name"),
            "text": (msg_data.get("text") or "")[:200],
            "date": msg_data.get("date"),
            "status": "processing",
        })
    except Exception as e:
        logger.warning(f"Failed to queue AI processing: {e}")
