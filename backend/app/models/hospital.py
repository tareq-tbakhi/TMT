import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Integer, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base


class HospitalStatus(str, enum.Enum):
    OPERATIONAL = "operational"
    LIMITED = "limited"
    FULL = "full"
    DESTROYED = "destroyed"


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(Enum(HospitalStatus), default=HospitalStatus.OPERATIONAL)
    bed_capacity = Column(Integer, default=0)
    icu_beds = Column(Integer, default=0)
    available_beds = Column(Integer, default=0)
    specialties = Column(JSONB, default=list)
    coverage_area = Column(Geometry("POLYGON", srid=4326), nullable=True)
    coverage_radius_km = Column(Float, default=15.0)
    phone = Column(String, nullable=True)
    supply_levels = Column(JSONB, default=dict)  # {"medicine": "high", "blood": "low", ...}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
