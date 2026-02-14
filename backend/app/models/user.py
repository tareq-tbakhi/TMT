import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.db.postgres import Base


class UserRole(str, enum.Enum):
    PATIENT = "patient"
    HOSPITAL_ADMIN = "hospital_admin"
    POLICE_ADMIN = "police_admin"
    CIVIL_DEFENSE_ADMIN = "civil_defense_admin"
    SUPER_ADMIN = "super_admin"


# Map roles to department types for convenience
ROLE_TO_DEPARTMENT = {
    UserRole.HOSPITAL_ADMIN: "hospital",
    UserRole.POLICE_ADMIN: "police",
    UserRole.CIVIL_DEFENSE_ADMIN: "civil_defense",
}

# All department admin roles
DEPARTMENT_ADMIN_ROLES = {
    UserRole.HOSPITAL_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.CIVIL_DEFENSE_ADMIN,
}


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=True)
    phone = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.PATIENT)
    is_active = Column(Boolean, default=True)
    hospital_id = Column(UUID(as_uuid=True), nullable=True)  # FK to hospitals (facilities)
    patient_id = Column(UUID(as_uuid=True), nullable=True)  # FK for patients
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def facility_id(self):
        """Alias for hospital_id — all facility types use this FK."""
        return self.hospital_id

    @facility_id.setter
    def facility_id(self, value):
        self.hospital_id = value

    @property
    def department_type(self):
        """Get the department type for this user's role."""
        return ROLE_TO_DEPARTMENT.get(self.role)

    @property
    def is_department_admin(self):
        return self.role in DEPARTMENT_ADMIN_ROLES
