"""
Telegram channel management routes.

Endpoints:
    GET    /telegram/status              — Connection status
    GET    /telegram/channels            — List monitored channels
    POST   /telegram/channels            — Add a channel to monitor
    DELETE /telegram/channels/{id}       — Stop monitoring a channel
    GET    /telegram/channels/{id}/messages — Recent messages from a channel
    POST   /telegram/channels/{id}/pause — Toggle pause/active
    POST   /telegram/connect             — Trigger Telegram connection
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.telegram_channel import TelegramChannel
from app.api.middleware.auth import require_role
from app.api.middleware.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TelegramChannelResponse(BaseModel):
    id: UUID
    channel_id: str
    channel_name: Optional[str] = None
    channel_url: Optional[str] = None
    trust_score: float
    total_reports: int
    verified_reports: int
    false_reports: int
    unverified_reports: int
    monitoring_status: str
    last_verified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TelegramChannelListResponse(BaseModel):
    channels: list[TelegramChannelResponse]
    total: int


class AddChannelRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    category: str = Field(default="unknown")
    language: str = Field(default="ar")


class TelegramMessageResponse(BaseModel):
    id: int
    text: str
    date: str
    channel: str
    views: Optional[int] = None
    forwards: Optional[int] = None


class TelegramStatusResponse(BaseModel):
    connected: bool
    configured: bool
    monitored_channels: int
    session_exists: bool


class TelegramEventResponse(BaseModel):
    id: UUID
    event_type: str
    severity: int
    title: Optional[str] = None
    details: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source_channel: Optional[str] = None
    confidence: Optional[float] = None
    original_text: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/telegram/status", response_model=TelegramStatusResponse)
async def get_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Get Telegram connection status."""
    configured = bool(
        settings.TELEGRAM_API_ID
        and settings.TELEGRAM_API_HASH
        and settings.TELEGRAM_PHONE
    )

    session_exists = Path("tmt_session.session").exists()

    connected = False
    if configured and session_exists:
        try:
            from app.telegram.client import _client
            connected = _client is not None and _client.is_connected()
        except Exception:
            pass

    # Count active channels in DB
    from sqlalchemy import func
    count = (await db.execute(
        select(func.count(TelegramChannel.id)).where(
            TelegramChannel.monitoring_status == "active"
        )
    )).scalar_one()

    return TelegramStatusResponse(
        connected=connected,
        configured=configured,
        monitored_channels=count,
        session_exists=session_exists,
    )


@router.get("/telegram/channels", response_model=TelegramChannelListResponse)
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """List all monitored Telegram channels with trust scores."""
    result = await db.execute(
        select(TelegramChannel).order_by(TelegramChannel.trust_score.desc())
    )
    channels = result.scalars().all()

    return TelegramChannelListResponse(
        channels=[TelegramChannelResponse(
            id=ch.id,
            channel_id=ch.channel_id,
            channel_name=ch.channel_name,
            channel_url=ch.channel_url,
            trust_score=ch.trust_score or 0.5,
            total_reports=ch.total_reports or 0,
            verified_reports=ch.verified_reports or 0,
            false_reports=ch.false_reports or 0,
            unverified_reports=ch.unverified_reports or 0,
            monitoring_status=ch.monitoring_status or "active",
            last_verified_at=ch.last_verified_at,
            created_at=ch.created_at,
        ) for ch in channels],
        total=len(channels),
    )


@router.post("/telegram/channels", response_model=TelegramChannelResponse,
             status_code=status.HTTP_201_CREATED)
async def add_channel(
    payload: AddChannelRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Add a new Telegram channel to monitor."""
    username = payload.username.lstrip("@")

    # Check if already exists
    existing = await db.execute(
        select(TelegramChannel).where(TelegramChannel.channel_id == username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Channel @{username} is already being monitored",
        )

    # Try to join the channel via Telethon
    try:
        from app.telegram.channel_manager import add_channel as cm_add_channel
        success = await cm_add_channel(username, payload.category, payload.language)
        if not success:
            logger.warning(f"Could not join @{username} via Telethon (may not be connected)")
    except Exception as e:
        logger.warning(f"Telethon join failed for @{username}: {e}")

    # Always create DB record
    channel = TelegramChannel(
        channel_id=username,
        channel_name=f"@{username}",
        channel_url=f"https://t.me/{username}",
        trust_score=0.5,
        total_reports=0,
        verified_reports=0,
        false_reports=0,
        unverified_reports=0,
        monitoring_status="active",
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)

    await log_audit(
        action="create",
        resource="telegram_channel",
        resource_id=str(channel.id),
        user_id=current_user.id,
        details=f"Added Telegram channel @{username} (category: {payload.category})",
        request=request,
        db=db,
    )

    return TelegramChannelResponse(
        id=channel.id,
        channel_id=channel.channel_id,
        channel_name=channel.channel_name,
        channel_url=channel.channel_url,
        trust_score=channel.trust_score,
        total_reports=channel.total_reports,
        verified_reports=channel.verified_reports,
        false_reports=channel.false_reports,
        unverified_reports=channel.unverified_reports,
        monitoring_status=channel.monitoring_status,
        last_verified_at=channel.last_verified_at,
        created_at=channel.created_at,
    )


@router.delete("/telegram/channels/{channel_id}",
               status_code=status.HTTP_204_NO_CONTENT)
async def remove_channel(
    channel_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Stop monitoring a Telegram channel. Preserves trust history."""
    result = await db.execute(
        select(TelegramChannel).where(TelegramChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )

    # Try to leave channel via Telethon
    try:
        from app.telegram.channel_manager import remove_channel as cm_remove
        await cm_remove(channel.channel_id)
    except Exception as e:
        logger.warning(f"Telethon leave failed for @{channel.channel_id}: {e}")

    channel.monitoring_status = "removed"
    channel.updated_at = datetime.utcnow()
    await db.flush()

    await log_audit(
        action="delete",
        resource="telegram_channel",
        resource_id=str(channel_id),
        user_id=current_user.id,
        details=f"Removed Telegram channel @{channel.channel_id}",
        request=request,
        db=db,
    )


@router.get("/telegram/channels/{channel_id}/messages",
            response_model=list[TelegramMessageResponse])
async def get_messages(
    channel_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Get recent messages from a monitored channel."""
    result = await db.execute(
        select(TelegramChannel).where(TelegramChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )

    try:
        from app.telegram.client import get_channel_messages
        messages = await get_channel_messages(channel.channel_id, limit=limit)
        return [TelegramMessageResponse(**msg) for msg in messages]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Cannot fetch messages: Telegram client not connected",
        )


@router.post("/telegram/channels/{channel_id}/pause")
async def toggle_pause(
    channel_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Toggle channel monitoring between active and paused."""
    result = await db.execute(
        select(TelegramChannel).where(TelegramChannel.id == channel_id)
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )

    new_status = "paused" if channel.monitoring_status == "active" else "active"
    channel.monitoring_status = new_status
    channel.updated_at = datetime.utcnow()
    await db.flush()

    await log_audit(
        action="update",
        resource="telegram_channel",
        resource_id=str(channel_id),
        user_id=current_user.id,
        details=f"Set channel @{channel.channel_id} to {new_status}",
        request=request,
        db=db,
    )

    return {"status": new_status, "channel_id": str(channel_id)}


class TelegramStoredMessageResponse(BaseModel):
    id: str
    message_id: Optional[int] = None
    chat_id: Optional[str] = None
    channel: Optional[str] = None
    channel_name: Optional[str] = None
    text: str
    date: str  # ISO format — the original sent_at timestamp

    model_config = ConfigDict(from_attributes=True)


@router.get("/telegram/messages", response_model=list[TelegramStoredMessageResponse])
async def get_stored_messages(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Return persisted Telegram messages so the live feed survives reloads."""
    from app.models.telegram_message import TelegramMessage

    cutoff = datetime.utcnow() - __import__("datetime").timedelta(hours=hours)
    result = await db.execute(
        select(TelegramMessage)
        .where(TelegramMessage.sent_at >= cutoff)
        .order_by(TelegramMessage.sent_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()

    return [
        TelegramStoredMessageResponse(
            id=str(m.id),
            message_id=m.message_id,
            chat_id=m.chat_id,
            channel=m.channel,
            channel_name=m.channel_name,
            text=m.text,
            date=m.sent_at.isoformat() if m.sent_at else "",
        )
        for m in messages
    ]


@router.get("/telegram/events", response_model=list[TelegramEventResponse])
async def get_telegram_events(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Get AI-classified events from Telegram channels."""
    from app.models.geo_event import GeoEvent, GeoEventSource

    cutoff = datetime.utcnow() - __import__("datetime").timedelta(hours=hours)
    result = await db.execute(
        select(GeoEvent)
        .where(GeoEvent.source == GeoEventSource.TELEGRAM)
        .where(GeoEvent.created_at >= cutoff)
        .order_by(GeoEvent.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()

    return [
        TelegramEventResponse(
            id=ev.id,
            event_type=ev.event_type,
            severity=ev.severity or 1,
            title=ev.title,
            details=ev.details,
            latitude=ev.latitude,
            longitude=ev.longitude,
            source_channel=(ev.metadata_ or {}).get("channel"),
            confidence=(ev.metadata_ or {}).get("confidence"),
            original_text=(ev.metadata_ or {}).get("original_text"),
            created_at=ev.created_at,
        )
        for ev in events
    ]


@router.get("/telegram/my-channels")
async def list_my_channels(
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """List all channels/groups from the user's Telegram account for discovery."""
    from app.telegram.client import list_my_dialogs

    try:
        dialogs = await list_my_dialogs()
        return {"channels": dialogs}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Cannot list Telegram channels: {str(e)}",
        )


@router.post("/telegram/import-channels")
async def import_channels(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Import multiple channels from the user's Telegram account.

    Body: { "channels": [{ "chat_id": "123", "name": "...", "username": "..." }, ...] }
    """
    channels_to_import = payload.get("channels", [])
    imported = []

    for ch_data in channels_to_import:
        chat_id = ch_data.get("chat_id", "")
        name = ch_data.get("name", "")
        username = ch_data.get("username")

        # Use chat_id as the unique identifier (works for private groups too)
        channel_id = username or chat_id
        if not channel_id:
            continue

        # Check if already exists
        existing = await db.execute(
            select(TelegramChannel).where(TelegramChannel.channel_id == channel_id)
        )
        if existing.scalar_one_or_none():
            continue

        channel = TelegramChannel(
            channel_id=channel_id,
            channel_name=name or (f"@{username}" if username else channel_id),
            channel_url=f"https://t.me/{username}" if username else None,
            trust_score=0.5,
            total_reports=0,
            verified_reports=0,
            false_reports=0,
            unverified_reports=0,
            monitoring_status="active",
        )
        db.add(channel)
        imported.append(name or channel_id)

    if imported:
        await db.flush()
        await log_audit(
            action="create",
            resource="telegram_channel",
            resource_id="bulk_import",
            user_id=current_user.id,
            details=f"Imported {len(imported)} channels: {', '.join(imported[:5])}",
            request=request,
            db=db,
        )

    return {"imported": len(imported), "channels": imported}


@router.post("/telegram/connect")
async def connect_telegram(
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Trigger Telegram client connection and channel initialization."""
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram credentials not configured. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE in .env",
        )

    if not Path("tmt_session.session").exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Telegram session. Use 'Connect Telegram' to authenticate first.",
        )

    try:
        from app.telegram.client import get_telegram_client, setup_message_handler
        from app.telegram.channel_manager import initialize_channels
        from app.telegram.message_handler import on_telegram_message

        client = await get_telegram_client()
        if client.is_connected():
            handler_registrar = setup_message_handler(on_telegram_message)
            await handler_registrar()

            asyncio.create_task(initialize_channels())
            return {"status": "connected", "message": "Telegram connected, initializing channels..."}
        else:
            return {"status": "disconnected", "message": "Client created but not connected"}
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect: {str(e)}",
        )


@router.post("/telegram/disconnect")
async def disconnect_telegram(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Disconnect Telegram and purge ALL Telegram-related data from the system."""
    from app.telegram.client import disconnect_and_cleanup
    from app.models.geo_event import GeoEvent, GeoEventSource
    from app.models.alert import Alert
    from sqlalchemy import delete

    # 1. Disconnect client, remove session files, clear in-memory state
    await disconnect_and_cleanup()

    # 2. Delete all Telegram channels from DB
    channel_result = await db.execute(delete(TelegramChannel))
    channels_deleted = channel_result.rowcount

    # 3. Delete all Telegram-sourced geo events
    events_result = await db.execute(
        delete(GeoEvent).where(GeoEvent.source == GeoEventSource.TELEGRAM)
    )
    events_deleted = events_result.rowcount

    # 4. Delete all Telegram-sourced alerts
    alerts_result = await db.execute(
        delete(Alert).where(Alert.source == "telegram")
    )
    alerts_deleted = alerts_result.rowcount

    # 5. Try to delete Telegram vectors from Qdrant
    try:
        from app.db.qdrant import get_qdrant, COLLECTION_NAME
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        qdrant = get_qdrant()
        qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value="telegram"))]
            ),
        )
    except Exception as e:
        logger.warning(f"Failed to clear Qdrant Telegram data: {e}")

    await db.flush()

    await log_audit(
        action="delete",
        resource="telegram_integration",
        resource_id="full_disconnect",
        user_id=current_user.id,
        details=f"Disconnected Telegram. Purged {channels_deleted} channels, {events_deleted} events, {alerts_deleted} alerts",
        request=request,
        db=db,
    )

    return {
        "status": "disconnected",
        "purged": {
            "channels": channels_deleted,
            "events": events_deleted,
            "alerts": alerts_deleted,
        },
    }


class SendCodeRequest(BaseModel):
    """Empty body — phone comes from server-side .env config."""
    pass


class VerifyCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=10)
    password: Optional[str] = None  # For 2FA accounts


@router.post("/telegram/auth/send-code")
async def send_auth_code(
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Start Telegram authentication. Sends a verification code to the configured phone."""
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH or not settings.TELEGRAM_PHONE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram credentials not configured. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE in .env",
        )

    try:
        from app.telegram.client import start_auth_flow
        result = await start_auth_flow()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send code: {str(e)}",
        )


@router.post("/telegram/auth/verify-code")
async def verify_auth_code(
    payload: VerifyCodeRequest,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Complete Telegram authentication with the received verification code."""
    try:
        from app.telegram.client import complete_auth_flow
        result = await complete_auth_flow(payload.code, payload.password)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}",
        )
