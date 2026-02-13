"""Telegram channel trust tracking model.

Each monitored Telegram channel gets a trust_score (0.0–1.0) that the AI agent
maintains.  The score is updated based on:

- How often the channel's reports are corroborated by other sources
- How many reports turned out to be false/unverifiable
- The channel's historical accuracy
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.postgres import Base


class TelegramChannel(Base):
    __tablename__ = "telegram_channels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id = Column(String, unique=True, nullable=False, index=True)
    channel_name = Column(String, nullable=True)
    channel_url = Column(String, nullable=True)

    # Trust scoring
    trust_score = Column(Float, default=0.5)  # 0.0–1.0 (0.5 = neutral/new)
    total_reports = Column(Integer, default=0)
    verified_reports = Column(Integer, default=0)  # Corroborated by other sources
    false_reports = Column(Integer, default=0)     # Unable to verify / contradicted
    unverified_reports = Column(Integer, default=0)  # Not yet checked

    # AI agent metadata
    monitoring_status = Column(String, default="active")  # active, paused, blacklisted
    last_verified_at = Column(DateTime, nullable=True)
    verification_notes = Column(JSONB, default=list)  # List of AI verification results

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
