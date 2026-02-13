"""
Patient service — CRUD, consent management, and location-based queries.

All public functions accept an ``AsyncSession`` so the caller (route layer)
controls the transaction boundary.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient, MobilityStatus, LivingSituation, Gender
from app.models.medical_record import MedicalRecord
from app.models.sos_request import SosRequest, SOSStatus, SOSSource, PatientStatus
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_point(longitude: float, latitude: float):
    """Return a PostGIS-compatible ``ST_SetSRID(ST_MakePoint(lon, lat), 4326)`` expression."""
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _patient_to_dict(patient: Patient) -> dict[str, Any]:
    """Serialise a Patient ORM instance into a plain dict."""
    return {
        "id": str(patient.id),
        "phone": patient.phone,
        "name": patient.name,
        # Demographics
        "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        "gender": patient.gender.value if patient.gender else None,
        "national_id": patient.national_id,
        "primary_language": patient.primary_language,
        # Location
        "latitude": patient.latitude,
        "longitude": patient.longitude,
        "location_name": patient.location_name,
        # Physical
        "mobility": patient.mobility.value if patient.mobility else None,
        "living_situation": patient.living_situation.value if patient.living_situation else None,
        "blood_type": patient.blood_type,
        "height_cm": patient.height_cm,
        "weight_kg": patient.weight_kg,
        # Medical
        "chronic_conditions": patient.chronic_conditions or [],
        "allergies": patient.allergies or [],
        "current_medications": patient.current_medications or [],
        "special_equipment": patient.special_equipment or [],
        "insurance_info": patient.insurance_info,
        "notes": patient.notes,
        # Contacts
        "emergency_contacts": patient.emergency_contacts or [],
        # System
        "false_alarm_count": patient.false_alarm_count,
        "total_sos_count": patient.total_sos_count,
        "trust_score": patient.trust_score,
        "consent_given_at": patient.consent_given_at.isoformat() if patient.consent_given_at else None,
        "is_active": patient.is_active,
        "created_at": patient.created_at.isoformat() if patient.created_at else None,
        "updated_at": patient.updated_at.isoformat() if patient.updated_at else None,
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_patient(
    db: AsyncSession,
    *,
    phone: str,
    name: str,
    latitude: float | None = None,
    longitude: float | None = None,
    mobility: str | MobilityStatus = MobilityStatus.CAN_WALK,
    living_situation: str | LivingSituation = LivingSituation.WITH_FAMILY,
    blood_type: str | None = None,
    emergency_contacts: list[dict] | None = None,
    consent_given: bool = False,
) -> dict[str, Any]:
    """Register a new patient.

    If *latitude* and *longitude* are supplied the PostGIS ``location`` column
    is populated automatically so spatial queries work immediately.
    """
    # Normalise enum values when passed as plain strings
    if isinstance(mobility, str):
        mobility = MobilityStatus(mobility)
    if isinstance(living_situation, str):
        living_situation = LivingSituation(living_situation)

    patient = Patient(
        id=uuid.uuid4(),
        phone=phone,
        name=name,
        latitude=latitude,
        longitude=longitude,
        location=_make_point(longitude, latitude) if latitude is not None and longitude is not None else None,
        mobility=mobility,
        living_situation=living_situation,
        blood_type=blood_type,
        emergency_contacts=emergency_contacts or [],
        consent_given_at=datetime.utcnow() if consent_given else None,
        is_active=True,
    )
    db.add(patient)
    await db.flush()
    await db.refresh(patient)
    logger.info("Created patient %s (%s)", patient.id, phone)
    return _patient_to_dict(patient)


async def get_patient(db: AsyncSession, patient_id: uuid.UUID) -> dict[str, Any] | None:
    """Return a single patient by primary key, or ``None``."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None
    return _patient_to_dict(patient)


async def get_patient_by_phone(db: AsyncSession, phone: str) -> dict[str, Any] | None:
    """Look up a patient by phone number."""
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None
    return _patient_to_dict(patient)


async def get_patient_model(db: AsyncSession, patient_id: uuid.UUID) -> Patient | None:
    """Return the raw ORM model — useful internally when other services need the row."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    return result.scalar_one_or_none()


async def get_patient_model_by_phone(db: AsyncSession, phone: str) -> Patient | None:
    """Return the raw ORM model by phone number."""
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    return result.scalar_one_or_none()


async def update_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    **fields: Any,
) -> dict[str, Any] | None:
    """Partial update of a patient record.

    Accepts any combination of patient fields as keyword arguments.  The
    ``location`` geometry is automatically kept in sync when *latitude* and/or
    *longitude* are provided.
    """
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None

    # Normalise enum strings
    if "mobility" in fields and isinstance(fields["mobility"], str):
        fields["mobility"] = MobilityStatus(fields["mobility"])
    if "living_situation" in fields and isinstance(fields["living_situation"], str):
        fields["living_situation"] = LivingSituation(fields["living_situation"])
    if "gender" in fields and isinstance(fields["gender"], str):
        fields["gender"] = Gender(fields["gender"])

    for key, value in fields.items():
        if hasattr(patient, key) and key not in ("id", "created_at"):
            setattr(patient, key, value)

    # Keep geometry in sync with scalar lat/lon
    lat = fields.get("latitude", patient.latitude)
    lon = fields.get("longitude", patient.longitude)
    if lat is not None and lon is not None and ("latitude" in fields or "longitude" in fields):
        patient.location = _make_point(lon, lat)

    patient.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(patient)
    logger.info("Updated patient %s", patient_id)
    return _patient_to_dict(patient)


async def deactivate_patient(db: AsyncSession, patient_id: uuid.UUID) -> bool:
    """Soft-delete a patient by marking them inactive."""
    result = await db.execute(
        update(Patient)
        .where(Patient.id == patient_id)
        .values(is_active=False, updated_at=datetime.utcnow())
    )
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# Location updates
# ---------------------------------------------------------------------------

async def update_patient_location(
    db: AsyncSession,
    patient_id: uuid.UUID,
    latitude: float,
    longitude: float,
) -> dict[str, Any] | None:
    """Dedicated location-update path — keeps both scalars and geometry in sync."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None

    patient.latitude = latitude
    patient.longitude = longitude
    patient.location = _make_point(longitude, latitude)
    patient.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(patient)
    logger.info("Updated location for patient %s to (%s, %s)", patient_id, latitude, longitude)
    return _patient_to_dict(patient)


# ---------------------------------------------------------------------------
# Spatial queries
# ---------------------------------------------------------------------------

async def search_patients_in_area(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_m: float = 5000,
    *,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    """Return all patients within *radius_m* metres of a point.

    Uses ``ST_DWithin`` on the **geography** cast for accurate metre-based
    distance regardless of latitude.
    """
    centre = _make_point(longitude, latitude)
    query = (
        select(Patient)
        .where(
            Patient.location.isnot(None),
            func.ST_DWithin(
                Patient.location.cast(Geography),
                centre.cast(Geography),
                radius_m,
            ),
        )
    )
    if active_only:
        query = query.where(Patient.is_active.is_(True))

    query = query.order_by(
        func.ST_Distance(
            Patient.location.cast(Geography),
            centre.cast(Geography),
        )
    )
    result = await db.execute(query)
    patients = result.scalars().all()
    return [_patient_to_dict(p) for p in patients]


async def get_vulnerable_patients_in_radius(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_m: float = 5000,
) -> list[dict[str, Any]]:
    """Return patients who cannot self-evacuate within a given radius.

    "Vulnerable" is defined as mobility in
    (``wheelchair``, ``bedridden``, ``other``) **or** living alone.
    """
    centre = _make_point(longitude, latitude)
    query = (
        select(Patient)
        .where(
            Patient.location.isnot(None),
            Patient.is_active.is_(True),
            func.ST_DWithin(
                Patient.location.cast(Geography),
                centre.cast(Geography),
                radius_m,
            ),
            and_(
                # At least one vulnerability criterion
                (Patient.mobility.in_([
                    MobilityStatus.WHEELCHAIR,
                    MobilityStatus.BEDRIDDEN,
                    MobilityStatus.OTHER,
                ]))
                | (Patient.living_situation == LivingSituation.ALONE)
            ),
        )
    )
    query = query.order_by(
        func.ST_Distance(
            Patient.location.cast(Geography),
            centre.cast(Geography),
        )
    )
    result = await db.execute(query)
    patients = result.scalars().all()
    return [_patient_to_dict(p) for p in patients]


# ---------------------------------------------------------------------------
# Consent management
# ---------------------------------------------------------------------------

async def grant_consent(db: AsyncSession, patient_id: uuid.UUID) -> dict[str, Any] | None:
    """Record the moment a patient grants data-processing consent."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None

    patient.consent_given_at = datetime.utcnow()
    patient.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(patient)

    # Audit trail
    db.add(AuditLog(
        action="consent_granted",
        resource="patient",
        resource_id=str(patient_id),
        details="Patient granted data-processing consent.",
    ))
    await db.flush()
    logger.info("Consent granted for patient %s", patient_id)
    return _patient_to_dict(patient)


async def revoke_consent(db: AsyncSession, patient_id: uuid.UUID) -> dict[str, Any] | None:
    """Clear consent timestamp and audit the action."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        return None

    patient.consent_given_at = None
    patient.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(patient)

    db.add(AuditLog(
        action="consent_revoked",
        resource="patient",
        resource_id=str(patient_id),
        details="Patient revoked data-processing consent.",
    ))
    await db.flush()
    logger.info("Consent revoked for patient %s", patient_id)
    return _patient_to_dict(patient)


async def has_consent(db: AsyncSession, patient_id: uuid.UUID) -> bool:
    """Return ``True`` if the patient has a non-null ``consent_given_at``."""
    result = await db.execute(
        select(Patient.consent_given_at).where(Patient.id == patient_id)
    )
    row = result.scalar_one_or_none()
    return row is not None


# ---------------------------------------------------------------------------
# List / search
# ---------------------------------------------------------------------------

async def list_patients(
    db: AsyncSession,
    *,
    active_only: bool = True,
    search: str | None = None,
    mobility: MobilityStatus | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Paginated patient list, ordered by creation date descending.

    Supports optional *search* (matched against name or phone) and
    *mobility* filtering.
    """
    query = select(Patient).order_by(Patient.created_at.desc())
    if active_only:
        query = query.where(Patient.is_active.is_(True))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            Patient.name.ilike(pattern) | Patient.phone.ilike(pattern)
        )
    if mobility is not None:
        query = query.where(Patient.mobility == mobility)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return [_patient_to_dict(p) for p in result.scalars().all()]


async def count_patients(db: AsyncSession, *, active_only: bool = True) -> int:
    """Return total patient count."""
    query = select(func.count(Patient.id))
    if active_only:
        query = query.where(Patient.is_active.is_(True))
    result = await db.execute(query)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Medical records
# ---------------------------------------------------------------------------

def _record_to_dict(record: MedicalRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "patient_id": record.patient_id,
        "conditions": record.conditions or [],
        "medications": record.medications or [],
        "allergies": record.allergies or [],
        "special_equipment": record.special_equipment or [],
        "notes": record.notes,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


async def get_medical_records(
    db: AsyncSession, patient_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Return all medical records for a patient."""
    result = await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.created_at.desc())
    )
    return [_record_to_dict(r) for r in result.scalars().all()]


async def create_medical_record(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    conditions: list[str] | None = None,
    medications: list[str] | None = None,
    allergies: list[str] | None = None,
    special_equipment: list[str] | None = None,
    notes: str | None = None,
) -> MedicalRecord:
    """Create a new medical record for a patient."""
    record = MedicalRecord(
        id=uuid.uuid4(),
        patient_id=patient_id,
        conditions=conditions or [],
        medications=medications or [],
        allergies=allergies or [],
        special_equipment=special_equipment or [],
        notes=notes,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    logger.info("Created medical record %s for patient %s", record.id, patient_id)
    return record


async def update_medical_record(
    db: AsyncSession, record_id: uuid.UUID, fields: dict[str, Any]
) -> MedicalRecord | None:
    """Update an existing medical record."""
    result = await db.execute(
        select(MedicalRecord).where(MedicalRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    for key, value in fields.items():
        if hasattr(record, key) and key not in ("id", "patient_id", "created_at"):
            setattr(record, key, value)
    record.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(record)
    logger.info("Updated medical record %s", record_id)
    return record


# ---------------------------------------------------------------------------
# SOS requests
# ---------------------------------------------------------------------------

def _sos_to_dict(sos: SosRequest) -> dict[str, Any]:
    return {
        "id": sos.id,
        "patient_id": sos.patient_id,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "status": sos.status,
        "patient_status": sos.patient_status,
        "severity": sos.severity,
        "source": sos.source,
        "hospital_notified_id": sos.hospital_notified_id,
        "origin_hospital_id": sos.origin_hospital_id,
        "auto_resolved": sos.auto_resolved,
        "details": sos.details,
        "created_at": sos.created_at,
        "resolved_at": sos.resolved_at,
        "routed_department": getattr(sos, "routed_department", None),
        "facility_notified_id": getattr(sos, "facility_notified_id", None),
    }


async def create_sos_request(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    latitude: float | None = None,
    longitude: float | None = None,
    patient_status: PatientStatus = PatientStatus.INJURED,
    severity: int = 3,
    source: SOSSource = SOSSource.API,
    details: str | None = None,
) -> SosRequest:
    """Create a new SOS request.

    If the SOS location falls within 500 m of any hospital (including
    non-operational ones), ``origin_hospital_id`` is set so the
    auto-resolution service knows the SOS started from a hospital.
    """
    from app.services import hospital_service
    from app.services.sos_resolution_service import HOSPITAL_ARRIVAL_RADIUS_M

    # Detect if SOS originates from within a hospital
    origin_hospital_id = None
    if latitude and longitude:
        nearby = await hospital_service.find_nearest_hospitals(
            db, latitude, longitude,
            radius_m=HOSPITAL_ARRIVAL_RADIUS_M,
            limit=1,
            operational_only=False,
        )
        if nearby:
            origin_hospital_id = nearby[0]["id"]

    sos = SosRequest(
        id=uuid.uuid4(),
        patient_id=patient_id,
        latitude=latitude,
        longitude=longitude,
        location=_make_point(longitude, latitude) if latitude and longitude else None,
        status=SOSStatus.PENDING,
        patient_status=patient_status,
        severity=severity,
        source=source,
        details=details,
        origin_hospital_id=origin_hospital_id,
    )
    db.add(sos)
    await db.flush()
    await db.refresh(sos)
    if origin_hospital_id:
        logger.info("Created SOS %s for patient %s (severity=%d, origin_hospital=%s)",
                     sos.id, patient_id, severity, origin_hospital_id)
    else:
        logger.info("Created SOS %s for patient %s (severity=%d)", sos.id, patient_id, severity)
    return sos


async def list_sos_requests(
    db: AsyncSession,
    *,
    hospital_id: uuid.UUID | None = None,
    status_filter: SOSStatus | None = None,
    severity_min: int | None = None,
    routed_department: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Paginated SOS request list. Returns (items, total_count).

    When routed_department is specified, filters to SOS routed to that department
    OR SOS that haven't been routed yet (routed_department IS NULL).
    """
    query = select(SosRequest).order_by(SosRequest.created_at.desc())

    if status_filter is not None:
        query = query.where(SosRequest.status == status_filter)
    if severity_min is not None:
        query = query.where(SosRequest.severity >= severity_min)
    if hospital_id is not None:
        query = query.where(
            (SosRequest.hospital_notified_id == hospital_id)
            | (SosRequest.hospital_notified_id.is_(None))
        )
    if routed_department is not None:
        query = query.where(
            (SosRequest.routed_department == routed_department)
            | (SosRequest.routed_department.is_(None))
        )

    # Count before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return [_sos_to_dict(s) for s in result.scalars().all()], total


async def list_patient_sos(
    db: AsyncSession,
    patient_id: uuid.UUID,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return recent SOS requests for a specific patient."""
    query = (
        select(SosRequest)
        .where(SosRequest.patient_id == patient_id)
        .order_by(SosRequest.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [_sos_to_dict(s) for s in result.scalars().all()]


async def update_sos_request(
    db: AsyncSession, sos_id: uuid.UUID, fields: dict[str, Any]
) -> SosRequest | None:
    """Update an SOS request (status change, hospital assignment, etc.)."""
    result = await db.execute(select(SosRequest).where(SosRequest.id == sos_id))
    sos = result.scalar_one_or_none()
    if sos is None:
        return None
    for key, value in fields.items():
        if hasattr(sos, key) and key not in ("id", "patient_id", "created_at"):
            setattr(sos, key, value)
    await db.flush()
    await db.refresh(sos)
    logger.info("Updated SOS %s -> %s", sos_id, fields)
    return sos
