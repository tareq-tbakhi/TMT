import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base
from app.models.alert import EventType


class GeoEventSource(str, enum.Enum):
    TELEGRAM = "telegram"
    SOS = "sos"
    HOSPITAL = "hospital"
    SMS = "sms"
    SYSTEM = "system"


class GeoEvent(Base):
    __tablename__ = "geo_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(Enum(EventType, create_type=False), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    source = Column(Enum(GeoEventSource), nullable=False)
    severity = Column(Integer, default=1)  # 1-5
    title = Column(String, nullable=True)
    details = Column(String, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)
    layer = Column(String, nullable=False)  # "sos", "crisis", "hospital", "sms_activity", "patient_density", "telegram_intel"
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
