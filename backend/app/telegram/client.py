"""
Telegram client using Telethon (MTProto API).
Connects to Telegram, monitors channels, extracts crisis information.
"""
import asyncio
import logging
from datetime import datetime

from telethon import TelegramClient, events
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.types import Channel

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global client instance
_client: TelegramClient | None = None


async def get_telegram_client() -> TelegramClient:
    global _client
    if _client is None:
        _client = TelegramClient(
            "tmt_session",
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
        )
        await _client.start(phone=settings.TELEGRAM_PHONE)
        logger.info("Telegram client started successfully")
    return _client


async def join_channel(channel_username: str) -> bool:
    """Join a Telegram channel. Returns True if successful."""
    try:
        client = await get_telegram_client()
        entity = await client.get_entity(channel_username)
        if isinstance(entity, Channel):
            await client(JoinChannelRequest(entity))
            logger.info(f"Joined channel: {channel_username}")
            # Human-like pacing — wait between joins
            await asyncio.sleep(5)
            return True
    except Exception as e:
        logger.error(f"Failed to join channel {channel_username}: {e}")
    return False


async def leave_channel(channel_username: str) -> bool:
    """Leave a Telegram channel."""
    try:
        client = await get_telegram_client()
        entity = await client.get_entity(channel_username)
        await client.delete_dialog(entity)
        logger.info(f"Left channel: {channel_username}")
        return True
    except Exception as e:
        logger.error(f"Failed to leave channel {channel_username}: {e}")
    return False


async def get_channel_messages(channel_username: str, limit: int = 50) -> list[dict]:
    """Read recent messages from a channel."""
    try:
        client = await get_telegram_client()
        entity = await client.get_entity(channel_username)
        messages = []
        async for message in client.iter_messages(entity, limit=limit):
            if message.text:
                messages.append({
                    "id": message.id,
                    "text": message.text,
                    "date": message.date.isoformat(),
                    "channel": channel_username,
                    "views": message.views,
                    "forwards": message.forwards,
                })
        return messages
    except Exception as e:
        logger.error(f"Failed to read messages from {channel_username}: {e}")
    return []


async def search_channels(query: str, limit: int = 10) -> list[dict]:
    """Search for public Telegram channels matching a query."""
    try:
        client = await get_telegram_client()
        result = await client.get_dialogs()
        channels = []
        for dialog in result:
            if isinstance(dialog.entity, Channel) and query.lower() in (dialog.name or "").lower():
                channels.append({
                    "id": dialog.entity.id,
                    "name": dialog.name,
                    "username": getattr(dialog.entity, "username", None),
                    "participants_count": getattr(dialog.entity, "participants_count", 0),
                })
                if len(channels) >= limit:
                    break
        return channels
    except Exception as e:
        logger.error(f"Failed to search channels: {e}")
    return []


def setup_message_handler(callback):
    """Register a handler for incoming messages across all monitored channels."""
    async def _handler(event):
        if event.message and event.message.text:
            msg_data = {
                "id": event.message.id,
                "text": event.message.text,
                "date": event.message.date.isoformat(),
                "chat_id": event.chat_id,
                "channel": getattr(event.chat, "username", str(event.chat_id)),
            }
            await callback(msg_data)

    async def register():
        client = await get_telegram_client()
        client.add_event_handler(_handler, events.NewMessage())
        logger.info("Message handler registered")

    return register
