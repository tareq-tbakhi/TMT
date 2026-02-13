import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Boolean, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base


class MobilityStatus(str, enum.Enum):
    CAN_WALK = "can_walk"
    WHEELCHAIR = "wheelchair"
    BEDRIDDEN = "bedridden"
    OTHER = "other"


class LivingSituation(str, enum.Enum):
    ALONE = "alone"
    WITH_FAMILY = "with_family"
    CARE_FACILITY = "care_facility"


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    mobility = Column(Enum(MobilityStatus), default=MobilityStatus.CAN_WALK)
    living_situation = Column(Enum(LivingSituation), default=LivingSituation.WITH_FAMILY)
    blood_type = Column(String, nullable=True)
    emergency_contacts = Column(JSONB, default=list)
    consent_given_at = Column(DateTime, nullable=True)
    sms_encryption_key = Column(String, nullable=True)  # Stored separately in production
    false_alarm_count = Column(Integer, default=0)
    total_sos_count = Column(Integer, default=0)
    trust_score = Column(Float, default=1.0)  # 0.0–1.0 (1.0 = fully trusted)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
