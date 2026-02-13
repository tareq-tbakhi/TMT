import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Integer, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base


class DepartmentType(str, enum.Enum):
    HOSPITAL = "hospital"
    POLICE = "police"
    CIVIL_DEFENSE = "civil_defense"


class FacilityStatus(str, enum.Enum):
    OPERATIONAL = "operational"
    LIMITED = "limited"
    FULL = "full"
    DESTROYED = "destroyed"


# Keep old enum as alias for backward compatibility
HospitalStatus = FacilityStatus


class Hospital(Base):
    """Facility model — supports hospitals, police stations, and civil defense centers.

    The table is named 'hospitals' for backward compatibility with existing FKs.
    Use department_type to distinguish facility types.
    """
    __tablename__ = "hospitals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    department_type = Column(
        Enum(DepartmentType, name="department_type", create_type=False),
        nullable=False,
        default=DepartmentType.HOSPITAL,
        server_default="hospital",
    )
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(Enum(FacilityStatus, name="facilitystatustype", create_type=False), default=FacilityStatus.OPERATIONAL)
    coverage_area = Column(Geometry("POLYGON", srid=4326), nullable=True)
    coverage_radius_km = Column(Float, default=15.0)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    website = Column(String, nullable=True)

    # --- Hospital-specific fields ---
    bed_capacity = Column(Integer, default=0)
    icu_beds = Column(Integer, default=0)
    available_beds = Column(Integer, default=0)
    specialties = Column(JSONB, default=list)
    supply_levels = Column(JSONB, default=dict)

    # --- Police-specific fields ---
    patrol_units = Column(Integer, default=0)
    available_units = Column(Integer, default=0)
    jurisdiction_area = Column(String, nullable=True)

    # --- Civil Defense-specific fields ---
    rescue_teams = Column(Integer, default=0)
    available_teams = Column(Integer, default=0)
    equipment_types = Column(JSONB, default=list)  # ["fire_truck", "ambulance", "crane", "hazmat"]
    shelter_capacity = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Alias for semantic clarity in new code
Facility = Hospital
