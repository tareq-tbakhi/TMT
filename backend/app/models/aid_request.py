"""
Aid Request models — hospitals can request blood, equipment, personnel, etc.
Other hospitals can respond to these requests.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Integer, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.postgres import Base


class AidCategory(str, enum.Enum):
    BLOOD = "blood"
    MEDICATION = "medication"
    EQUIPMENT = "equipment"
    PERSONNEL = "personnel"
    SUPPLIES = "supplies"
    OTHER = "other"


class AidUrgency(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AidRequestStatus(str, enum.Enum):
    OPEN = "open"
    RESPONDING = "responding"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class AidResponseStatus(str, enum.Enum):
    COMMITTED = "committed"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class AidRequest(Base):
    __tablename__ = "aid_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requesting_hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    category = Column(Enum(AidCategory), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    urgency = Column(Enum(AidUrgency), default=AidUrgency.MEDIUM)
    quantity = Column(String, nullable=True)  # e.g. "10 units", "2 machines"
    unit = Column(String, nullable=True)  # e.g. "units", "liters", "pieces"
    status = Column(Enum(AidRequestStatus), default=AidRequestStatus.OPEN)
    contact_phone = Column(String, nullable=True)
    contact_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fulfilled_at = Column(DateTime, nullable=True)

    responses = relationship("AidResponse", back_populates="aid_request", lazy="selectin")


class AidResponse(Base):
    __tablename__ = "aid_responses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aid_request_id = Column(UUID(as_uuid=True), ForeignKey("aid_requests.id"), nullable=False)
    responding_hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=False)
    message = Column(Text, nullable=True)
    eta_hours = Column(Float, nullable=True)
    status = Column(Enum(AidResponseStatus), default=AidResponseStatus.COMMITTED)
    created_at = Column(DateTime, default=datetime.utcnow)

    aid_request = relationship("AidRequest", back_populates="responses")
