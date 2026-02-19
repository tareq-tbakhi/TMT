import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Enum, DateTime, Float, Integer, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.db.postgres import Base


class SOSStatus(str, enum.Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class SOSSource(str, enum.Enum):
    API = "api"
    SMS = "sms"
    MESH = "mesh"  # Bridgefy Bluetooth mesh relay


class PatientStatus(str, enum.Enum):
    SAFE = "safe"
    INJURED = "injured"
    TRAPPED = "trapped"
    EVACUATE = "evacuate"


class SosRequest(Base):
    __tablename__ = "sos_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False, index=True)
    location = Column(Geometry("POINT", srid=4326), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(Enum(SOSStatus), default=SOSStatus.PENDING)
    patient_status = Column(Enum(PatientStatus), default=PatientStatus.INJURED)
    severity = Column(Integer, default=3)  # 1-5
    source = Column(Enum(SOSSource), default=SOSSource.API)
    hospital_notified_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=True)
    origin_hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=True)
    auto_resolved = Column(Boolean, default=False)
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # --- AI triage conversation transcript ---
    triage_transcript = Column(JSONB, nullable=True)  # [{role, content, timestamp}, ...]

    # --- Multi-department routing ---
    routed_department = Column(String, nullable=True)  # "hospital", "police", "civil_defense"
    facility_notified_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.id"), nullable=True)
    transferred_from_id = Column(UUID(as_uuid=True), ForeignKey("sos_requests.id"), nullable=True)
    transfer_reason = Column(String, nullable=True)

    # --- Mesh relay tracking ---
    mesh_message_id = Column(String, nullable=True, index=True)  # Bridgefy message UUID for dedup
    mesh_relay_device_id = Column(String, nullable=True)  # Device that relayed to backend
    mesh_hop_count = Column(Integer, nullable=True)  # Number of mesh hops
    mesh_relay_timestamp = Column(DateTime, nullable=True)  # When relayed to backend
