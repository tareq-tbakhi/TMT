import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.postgres import Base


class TransferStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    IN_TRANSIT = "in_transit"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CaseTransfer(Base):
    __tablename__ = "case_transfers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sos_request_id = Column(UUID(as_uuid=True), ForeignKey("sos_requests.id"), nullable=False, index=True)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=True)
    from_facility_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    to_facility_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    from_department = Column(String, nullable=False)  # "hospital", "police", "civil_defense"
    to_department = Column(String, nullable=False)
    reason = Column(String, nullable=True)
    status = Column(Enum(TransferStatus), default=TransferStatus.PENDING)
    transferred_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    accepted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # --- Patient transfer details (additive, all nullable) ---
    patient_ref = Column(String, nullable=True)      # patient name / identifier shown on the board
    urgency = Column(String, nullable=True)          # low | medium | high | critical
    medical_notes = Column(Text, nullable=True)      # condition, equipment needed, precautions
    accepted_facility_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=True)

    # --- Status timeline timestamps (additive, all nullable) ---
    accepted_at = Column(DateTime, nullable=True)
    in_transit_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
