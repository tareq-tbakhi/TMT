import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EventType(str, enum.Enum):
    FLOOD = "flood"
    BOMBING = "bombing"
    EARTHQUAKE = "earthquake"
    FIRE = "fire"
    BUILDING_COLLAPSE = "building_collapse"
    SHOOTING = "shooting"
    CHEMICAL = "chemical"
    MEDICAL_EMERGENCY = "medical_emergency"
    INFRASTRUCTURE = "infrastructure"
    OTHER = "other"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(Enum(EventType), nullable=False)
    severity = Column(Enum(AlertSeverity), nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius_m = Column(Float, default=1000)  # Affected radius in meters
    title = Column(String, nullable=False)
    details = Column(String, nullable=True)
    source = Column(String, nullable=True)  # "telegram", "user_report", "system"
    confidence = Column(Float, default=0.5)
    acknowledged = Column(String, nullable=True)  # hospital_id that acknowledged
    metadata_ = Column("metadata", JSONB, default=dict)
    affected_patients_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
