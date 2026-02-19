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

# Track whether event handlers are already registered
_handlers_registered: bool = False

# Track the connection monitor task so we can cancel it on reconnect
_monitor_task: asyncio.Task | None = None


async def get_telegram_client(session_name: str = "tmt_session") -> TelegramClient:
    global _client
    if _client is None:
        logger.info("Creating new Telegram client from session '%s'", session_name)
        _client = TelegramClient(
            session_name,
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
        )
        await _client.connect()
        logger.info("Telegram TCP connection established")

        if not await _client.is_user_authorized():
            await _client.disconnect()
            _client = None
            raise RuntimeError(
                "Telegram session not authorized. "
                "Use the Connect button in the Social Media page to authenticate."
            )

        # get_me() + get_dialogs() together force Telethon to fully
        # initialise its internal update-handling state machine.
        # Without this, reconnecting from a stale session file leaves
        # the update dispatcher inactive and event handlers never fire.
        me = await _client.get_me()
        logger.info("Telegram authorised as %s (id=%s)", me.first_name, me.id)
        try:
            await _client.get_dialogs(limit=1)
            logger.info("Telegram update state initialised (get_dialogs OK)")
        except Exception as e:
            logger.warning("get_dialogs warm-up failed (non-fatal): %s", e)

        logger.info("Telegram client ready")
    elif not _client.is_connected():
        logger.warning("Telegram client was disconnected — reconnecting...")
        await _client.connect()
        await _client.get_me()
        try:
            await _client.get_dialogs(limit=1)
        except Exception:
            pass
        logger.info("Telegram client reconnected")
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
    global _client, _handlers_registered, _monitor_task
    _auth_state.clear()

    # Cancel the connection monitor
    if _monitor_task is not None and not _monitor_task.done():
        _monitor_task.cancel()
        _monitor_task = None

    # 1. Disconnect the active client
    if _client is not None:
        try:
            await _client.disconnect()
        except Exception as e:
            logger.warning(f"Error disconnecting Telegram client: {e}")
        _client = None
        _handlers_registered = False

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
    """Register a handler for incoming messages across all monitored channels.

    Safe to call multiple times — removes previous handlers first to avoid
    duplicates after restarts or reconnections.
    """
    async def _handler(event):
        # Use raw_text which includes captions from media messages
        text = event.message.raw_text if event.message else None
        if not text:
            logger.debug(f"Skipping message {getattr(event.message, 'id', '?')} — no text content (media-only)")
            return

        chat = event.chat
        chat_name = getattr(chat, "title", None) or getattr(chat, "username", None) or str(event.chat_id)
        msg_data = {
            "id": event.message.id,
            "text": text,
            "date": event.message.date.isoformat(),
            "chat_id": str(event.chat_id),
            "channel": getattr(chat, "username", None) or str(event.chat_id),
            "channel_name": chat_name,
        }
        logger.info(f"Received message {event.message.id} from {chat_name}: {text[:80]}...")
        try:
            await callback(msg_data)
        except Exception as e:
            logger.error(f"Message handler callback failed for msg {event.message.id}: {e}")

    async def register():
        global _handlers_registered, _monitor_task

        client = await get_telegram_client()

        # Remove ALL existing NewMessage handlers to prevent duplicates
        # after app restart or repeated /connect calls
        client.remove_event_handler(_handler, events.NewMessage())
        for cb, ev in list(client.list_event_handlers()):
            if isinstance(ev, events.NewMessage):
                client.remove_event_handler(cb, ev)
                logger.debug("Removed stale NewMessage handler")

        client.add_event_handler(_handler, events.NewMessage())
        logger.info("Message handler registered for all chats")

        # Cancel the previous monitor task if it exists
        if _monitor_task is not None and not _monitor_task.done():
            _monitor_task.cancel()
            logger.debug("Cancelled previous connection monitor")

        _monitor_task = asyncio.create_task(_connection_monitor(client))
        _handlers_registered = True

    return register


async def _connection_monitor(client: TelegramClient):
    """Periodically check the Telegram connection and reconnect if needed."""
    try:
        while True:
            await asyncio.sleep(60)
            try:
                if not client.is_connected():
                    logger.warning("Telegram client disconnected — reconnecting…")
                    await client.connect()
                    await client.get_me()
                    try:
                        await client.get_dialogs(limit=1)
                    except Exception:
                        pass
                    logger.info("Telegram client reconnected by monitor")
            except Exception as e:
                logger.error(f"Connection monitor reconnect failed: {e}")
    except asyncio.CancelledError:
        logger.debug("Connection monitor cancelled")
        return
