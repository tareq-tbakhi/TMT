import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, LargeBinary
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.postgres import Base


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False, index=True)
    conditions = Column(JSONB, default=list)  # ["diabetes", "heart_disease"]
    medications = Column(JSONB, default=list)  # ["insulin", "aspirin"]
    allergies = Column(JSONB, default=list)
    special_equipment = Column(JSONB, default=list)  # ["oxygen", "dialysis"]
    encrypted_data = Column(LargeBinary, nullable=True)  # AES-256 encrypted sensitive data
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
