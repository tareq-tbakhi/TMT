"""
Telegram client using Telethon (MTProto API).
Connects to Telegram, monitors channels, extracts crisis information.
"""
import asyncio
import logging
from datetime import datetime

from telethon import TelegramClient, events
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.types import Channel, Chat, User as TgUser
from telethon.errors import SessionPasswordNeededError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global client instance
_client: TelegramClient | None = None

# Auth flow state (temporary, for the send-code → verify-code flow)
_auth_state: dict = {}


async def get_telegram_client() -> TelegramClient:
    global _client
    if _client is None:
        _client = TelegramClient(
            "tmt_session",
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
        )
        await _client.connect()
        if not await _client.is_user_authorized():
            await _client.disconnect()
            _client = None
            raise RuntimeError(
                "Telegram session not authorized. "
                "Use the Connect button in the Social Media page to authenticate."
            )
        logger.info("Telegram client started successfully")
    return _client


async def start_auth_flow() -> dict:
    """Start Telegram authentication. Sends a verification code to the phone."""
    global _client
    _auth_state.clear()

    client = TelegramClient(
        "tmt_session",
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH,
    )
    await client.connect()

    if await client.is_user_authorized():
        _client = client
        return {"status": "already_authorized", "phone_hint": settings.TELEGRAM_PHONE[-4:]}

    result = await client.send_code_request(settings.TELEGRAM_PHONE)
    _auth_state["client"] = client
    _auth_state["phone_code_hash"] = result.phone_code_hash

    return {"status": "code_sent", "phone_hint": settings.TELEGRAM_PHONE[-4:]}


async def complete_auth_flow(code: str, password: str | None = None) -> dict:
    """Complete Telegram authentication with the verification code."""
    global _client

    client = _auth_state.get("client")
    phone_code_hash = _auth_state.get("phone_code_hash")

    if not client or not phone_code_hash:
        raise RuntimeError("No pending authentication. Send the code first.")

    try:
        await client.sign_in(
            settings.TELEGRAM_PHONE,
            code,
            phone_code_hash=phone_code_hash,
        )
    except SessionPasswordNeededError:
        if password:
            await client.sign_in(password=password)
        else:
            return {"status": "2fa_required", "message": "Two-factor authentication password required"}

    _auth_state.clear()
    _client = client
    logger.info("Telegram authenticated successfully via UI")
    return {"status": "authenticated", "message": "Telegram connected successfully"}


async def disconnect_and_cleanup() -> dict:
    """Disconnect the Telegram client, remove session file, and clear all in-memory state."""
    global _client
    _auth_state.clear()

    # 1. Disconnect the active client
    if _client is not None:
        try:
            await _client.disconnect()
        except Exception as e:
            logger.warning(f"Error disconnecting Telegram client: {e}")
        _client = None

    # 2. Remove session files
    from pathlib import Path
    for f in Path(".").glob("tmt_session.session*"):
        try:
            f.unlink()
            logger.info(f"Deleted session file: {f}")
        except Exception as e:
            logger.warning(f"Failed to delete {f}: {e}")

    # 3. Clear in-memory channel registry
    try:
        from app.telegram.channel_manager import _monitored_channels
        _monitored_channels.clear()
        logger.info("Cleared in-memory channel registry")
    except Exception as e:
        logger.warning(f"Failed to clear channel registry: {e}")

    logger.info("Telegram disconnected and cleaned up")
    return {"status": "disconnected", "message": "Telegram disconnected and all data purged"}


async def list_my_dialogs() -> list[dict]:
    """List all channels and groups the user is part of."""
    try:
        client = await get_telegram_client()
        dialogs = await client.get_dialogs()
        results = []
        for dialog in dialogs:
            entity = dialog.entity
            # Include channels and groups (not private chats with users)
            if isinstance(entity, (Channel, Chat)):
                results.append({
                    "chat_id": str(entity.id),
                    "name": dialog.name or "",
                    "username": getattr(entity, "username", None),
                    "type": "channel" if isinstance(entity, Channel) and entity.broadcast else "group",
                    "participants_count": getattr(entity, "participants_count", None),
                })
        return results
    except Exception as e:
        logger.error(f"Failed to list dialogs: {e}")
    return []


async def join_channel(channel_username: str) -> bool:
    """Join a Telegram channel. Returns True if successful."""
    try:
        client = await get_telegram_client()
        entity = await client.get_entity(channel_username)
        if isinstance(entity, Channel):
            await client(JoinChannelRequest(entity))
            logger.info(f"Joined channel: {channel_username}")
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


async def get_channel_messages(channel_id: str, limit: int = 50) -> list[dict]:
    """Read recent messages from a channel by username or chat_id."""
    try:
        client = await get_telegram_client()
        # Try numeric chat_id first, then username
        try:
            entity = await client.get_entity(int(channel_id))
        except (ValueError, TypeError):
            entity = await client.get_entity(channel_id)
        messages = []
        async for message in client.iter_messages(entity, limit=limit):
            if message.text:
                messages.append({
                    "id": message.id,
                    "text": message.text,
                    "date": message.date.isoformat(),
                    "channel": getattr(entity, "username", None) or str(entity.id),
                    "views": message.views,
                    "forwards": message.forwards,
                })
        return messages
    except Exception as e:
        logger.error(f"Failed to read messages from {channel_id}: {e}")
    return []


async def resolve_entity(identifier: str) -> dict | None:
    """Resolve a channel/group by username or chat_id and return its info."""
    try:
        client = await get_telegram_client()
        try:
            entity = await client.get_entity(int(identifier))
        except (ValueError, TypeError):
            entity = await client.get_entity(identifier)
        if isinstance(entity, (Channel, Chat)):
            name = getattr(entity, "title", None) or ""
            username = getattr(entity, "username", None)
            return {
                "chat_id": str(entity.id),
                "name": name,
                "username": username,
                "type": "channel" if isinstance(entity, Channel) and entity.broadcast else "group",
            }
    except Exception as e:
        logger.error(f"Failed to resolve entity {identifier}: {e}")
    return None


def setup_message_handler(callback):
    """Register a handler for incoming messages across all monitored channels."""
    async def _handler(event):
        if event.message and event.message.text:
            chat = event.chat
            chat_name = getattr(chat, "title", None) or getattr(chat, "username", None) or str(event.chat_id)
            msg_data = {
                "id": event.message.id,
                "text": event.message.text,
                "date": event.message.date.isoformat(),
                "chat_id": str(event.chat_id),
                "channel": getattr(chat, "username", None) or str(event.chat_id),
                "channel_name": chat_name,
            }
            await callback(msg_data)

    async def register():
        client = await get_telegram_client()
        client.add_event_handler(_handler, events.NewMessage())
        logger.info("Message handler registered")

    return register
