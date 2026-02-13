import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.db.postgres import Base


class UserRole(str, enum.Enum):
    PATIENT = "patient"
    HOSPITAL_ADMIN = "hospital_admin"
    SUPER_ADMIN = "super_admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=True)
    phone = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.PATIENT)
    is_active = Column(Boolean, default=True)
    hospital_id = Column(UUID(as_uuid=True), nullable=True)  # FK set for doctors/admins
    patient_id = Column(UUID(as_uuid=True), nullable=True)  # FK set for patients
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
