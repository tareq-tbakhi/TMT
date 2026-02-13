"""Telegram message persistence model.

Stores every incoming message from monitored channels so the live feed
survives page reloads and re-logins.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.postgres import Base


class TelegramMessage(Base):
    __tablename__ = "telegram_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(Integer, nullable=True, index=True)
    chat_id = Column(String, nullable=True, index=True)
    channel = Column(String, nullable=True)
    channel_name = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    sent_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
