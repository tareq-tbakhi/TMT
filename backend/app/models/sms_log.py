import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.db.postgres import Base


class SMSDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    direction = Column(Enum(SMSDirection), nullable=False)
    phone = Column(String, nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True)
    message_body = Column(String, nullable=True)  # Never store decrypted medical data
    decrypted = Column(Boolean, default=False)
    delivery_status = Column(String, default="pending")  # pending, delivered, failed
    twilio_sid = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
