import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Boolean, Float, Integer, Date
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


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)

    # Demographics
    date_of_birth = Column(Date, nullable=True)
    gender = Column(Enum(Gender), nullable=True)
    national_id = Column(String, nullable=True)
    primary_language = Column(String, nullable=True, default="ar")

    # Home location
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String, nullable=True)  # Reverse-geocoded address

    # Physical status
    mobility = Column(Enum(MobilityStatus), default=MobilityStatus.CAN_WALK)
    living_situation = Column(Enum(LivingSituation), default=LivingSituation.WITH_FAMILY)
    blood_type = Column(String, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)

    # Medical info (directly on patient for quick access)
    chronic_conditions = Column(JSONB, default=list)   # ["diabetes", "hypertension"]
    allergies = Column(JSONB, default=list)             # ["penicillin", "peanuts"]
    current_medications = Column(JSONB, default=list)   # ["metformin 500mg", "lisinopril 10mg"]
    special_equipment = Column(JSONB, default=list)     # ["oxygen_tank", "wheelchair"]
    insurance_info = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    # Contacts
    emergency_contacts = Column(JSONB, default=list)

    # System fields
    consent_given_at = Column(DateTime, nullable=True)
    sms_encryption_key = Column(String, nullable=True)
    false_alarm_count = Column(Integer, default=0)
    total_sos_count = Column(Integer, default=0)
    trust_score = Column(Float, default=1.0)  # 0.0–1.0 (1.0 = fully trusted)
    risk_score = Column(Float, default=0.0)   # 0–100 persistent AI risk score
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.LOW)
    risk_updated_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
