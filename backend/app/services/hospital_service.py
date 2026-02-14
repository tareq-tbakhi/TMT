"""
Hospital service — CRUD, status management, and spatial nearest-hospital queries.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hospital import Hospital, HospitalStatus, DepartmentType, FacilityStatus
from app.api.websocket.handler import broadcast_hospital_status

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_point(longitude: float, latitude: float):
    """PostGIS point expression."""
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _hospital_to_dict(hospital: Hospital) -> dict[str, Any]:
    dept = getattr(hospital, "department_type", None)
    dept_val = dept.value if hasattr(dept, "value") else (str(dept) if dept else "hospital")
    return {
        "id": str(hospital.id),
        "name": hospital.name,
        "department_type": dept_val,
        "latitude": hospital.latitude,
        "longitude": hospital.longitude,
        "status": hospital.status.value if hospital.status else None,
        "coverage_radius_km": hospital.coverage_radius_km,
        "phone": hospital.phone,
        "email": hospital.email,
        "address": hospital.address,
        "website": hospital.website,
        # Hospital-specific
        "bed_capacity": hospital.bed_capacity,
        "icu_beds": hospital.icu_beds,
        "available_beds": hospital.available_beds,
        "specialties": hospital.specialties,
        "supply_levels": hospital.supply_levels,
        # Police-specific
        "patrol_units": getattr(hospital, "patrol_units", 0),
        "available_units": getattr(hospital, "available_units", 0),
        "jurisdiction_area": getattr(hospital, "jurisdiction_area", None),
        # Civil Defense-specific
        "rescue_teams": getattr(hospital, "rescue_teams", 0),
        "available_teams": getattr(hospital, "available_teams", 0),
        "equipment_types": getattr(hospital, "equipment_types", []),
        "shelter_capacity": getattr(hospital, "shelter_capacity", 0),
        # Timestamps
        "created_at": hospital.created_at.isoformat() if hospital.created_at else None,
        "updated_at": hospital.updated_at.isoformat() if hospital.updated_at else None,
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_hospital(
    db: AsyncSession,
    *,
    name: str,
    department_type: str | DepartmentType = DepartmentType.HOSPITAL,
    latitude: float | None = None,
    longitude: float | None = None,
    status: str | HospitalStatus = HospitalStatus.OPERATIONAL,
    bed_capacity: int = 0,
    icu_beds: int = 0,
    available_beds: int = 0,
    specialties: list[str] | None = None,
    coverage_radius_km: float = 15.0,
    phone: str | None = None,
    supply_levels: dict[str, str] | None = None,
    # Police
    patrol_units: int = 0,
    available_units: int = 0,
    jurisdiction_area: str | None = None,
    # Civil Defense
    rescue_teams: int = 0,
    available_teams: int = 0,
    equipment_types: list[str] | None = None,
    shelter_capacity: int = 0,
) -> dict[str, Any]:
    """Register a new facility (hospital, police station, or civil defense center)."""
    if isinstance(status, str):
        status = HospitalStatus(status)
    if isinstance(department_type, str):
        department_type = DepartmentType(department_type)

    hospital = Hospital(
        id=uuid.uuid4(),
        name=name,
        department_type=department_type,
        latitude=latitude,
        longitude=longitude,
        location=_make_point(longitude, latitude) if latitude is not None and longitude is not None else None,
        status=status,
        bed_capacity=bed_capacity,
        icu_beds=icu_beds,
        available_beds=available_beds,
        specialties=specialties or [],
        coverage_radius_km=coverage_radius_km,
        phone=phone,
        supply_levels=supply_levels or {},
        patrol_units=patrol_units,
        available_units=available_units,
        jurisdiction_area=jurisdiction_area,
        rescue_teams=rescue_teams,
        available_teams=available_teams,
        equipment_types=equipment_types or [],
        shelter_capacity=shelter_capacity,
    )
    db.add(hospital)
    await db.flush()
    await db.refresh(hospital)
    logger.info("Created facility %s (%s, type=%s)", hospital.id, name, department_type.value)
    return _hospital_to_dict(hospital)


async def get_hospital(db: AsyncSession, hospital_id: uuid.UUID) -> dict[str, Any] | None:
    """Return a single hospital by primary key."""
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        return None
    return _hospital_to_dict(hospital)


async def get_hospital_model(db: AsyncSession, hospital_id: uuid.UUID) -> Hospital | None:
    """Return the raw ORM instance."""
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    return result.scalar_one_or_none()


async def update_hospital(
    db: AsyncSession,
    hospital_id: uuid.UUID,
    **fields: Any,
) -> dict[str, Any] | None:
    """Partial update — pass only the fields that need changing."""
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        return None

    if "status" in fields and isinstance(fields["status"], str):
        fields["status"] = HospitalStatus(fields["status"])

    for key, value in fields.items():
        if hasattr(hospital, key) and key not in ("id", "created_at"):
            setattr(hospital, key, value)

    # Keep geometry in sync
    lat = fields.get("latitude", hospital.latitude)
    lon = fields.get("longitude", hospital.longitude)
    if lat is not None and lon is not None and ("latitude" in fields or "longitude" in fields):
        hospital.location = _make_point(lon, lat)

    hospital.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(hospital)
    logger.info("Updated hospital %s", hospital_id)
    return _hospital_to_dict(hospital)


async def update_hospital_status(
    db: AsyncSession,
    hospital_id: uuid.UUID,
    status: str | HospitalStatus,
    *,
    available_beds: int | None = None,
    supply_levels: dict[str, str] | None = None,
    broadcast: bool = True,
) -> dict[str, Any] | None:
    """Update a hospital's operational status and optionally broadcast via WS.

    This is the primary function called when a hospital reports a change in
    capacity or a change in its operational state (e.g. *destroyed* after an
    attack).
    """
    if isinstance(status, str):
        status = HospitalStatus(status)

    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        return None

    hospital.status = status
    if available_beds is not None:
        hospital.available_beds = available_beds
    if supply_levels is not None:
        hospital.supply_levels = supply_levels
    hospital.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(hospital)

    payload = _hospital_to_dict(hospital)

    if broadcast:
        try:
            await broadcast_hospital_status(payload)
        except Exception:
            logger.exception("Failed to broadcast hospital status for %s", hospital_id)

    logger.info("Hospital %s status -> %s", hospital_id, status.value)
    return payload


# ---------------------------------------------------------------------------
# List / search
# ---------------------------------------------------------------------------

async def list_hospitals(
    db: AsyncSession,
    *,
    status: str | HospitalStatus | None = None,
    department_type: str | DepartmentType | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Paginated facility list, optionally filtered by status and department type."""
    query = select(Hospital).order_by(Hospital.name).limit(limit).offset(offset)
    if status is not None:
        if isinstance(status, str):
            status = HospitalStatus(status)
        query = query.where(Hospital.status == status)
    if department_type is not None:
        if isinstance(department_type, str):
            department_type = DepartmentType(department_type)
        query = query.where(Hospital.department_type == department_type)
    result = await db.execute(query)
    return [_hospital_to_dict(h) for h in result.scalars().all()]


async def count_hospitals(db: AsyncSession) -> int:
    result = await db.execute(select(func.count(Hospital.id)))
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Spatial — find nearest
# ---------------------------------------------------------------------------

async def find_nearest_hospitals(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    *,
    radius_m: float = 50_000,
    limit: int = 10,
    operational_only: bool = True,
    department_type: str | DepartmentType | None = None,
) -> list[dict[str, Any]]:
    """Find facilities closest to a point within *radius_m* metres.

    Results include a ``distance_m`` field indicating distance from the query
    point.  By default only **operational** or **limited** facilities are
    returned; set *operational_only=False* to include all statuses.
    Optionally filter by department_type.
    """
    centre = _make_point(longitude, latitude)

    distance_expr = func.ST_Distance(
        Hospital.location.cast(Geography),
        centre.cast(Geography),
    ).label("distance_m")

    query = (
        select(Hospital, distance_expr)
        .where(
            Hospital.location.isnot(None),
            func.ST_DWithin(
                Hospital.location.cast(Geography),
                centre.cast(Geography),
                radius_m,
            ),
        )
        .order_by(distance_expr)
        .limit(limit)
    )

    if operational_only:
        query = query.where(
            Hospital.status.in_([HospitalStatus.OPERATIONAL, HospitalStatus.LIMITED])
        )

    if department_type is not None:
        if isinstance(department_type, str):
            department_type = DepartmentType(department_type)
        query = query.where(Hospital.department_type == department_type)

    result = await db.execute(query)
    rows = result.all()

    hospitals: list[dict[str, Any]] = []
    for hospital, distance in rows:
        data = _hospital_to_dict(hospital)
        data["distance_m"] = round(distance, 1) if distance is not None else None
        hospitals.append(data)

    return hospitals


async def find_nearest_operational_hospital(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    *,
    radius_m: float = 50_000,
) -> dict[str, Any] | None:
    """Convenience wrapper — returns the single nearest hospital that is
    operational and has available beds, or ``None``."""
    centre = _make_point(longitude, latitude)

    distance_expr = func.ST_Distance(
        Hospital.location.cast(Geography),
        centre.cast(Geography),
    ).label("distance_m")

    query = (
        select(Hospital, distance_expr)
        .where(
            Hospital.location.isnot(None),
            Hospital.status == HospitalStatus.OPERATIONAL,
            Hospital.available_beds > 0,
            func.ST_DWithin(
                Hospital.location.cast(Geography),
                centre.cast(Geography),
                radius_m,
            ),
        )
        .order_by(distance_expr)
        .limit(1)
    )
    result = await db.execute(query)
    row = result.first()
    if row is None:
        return None
    hospital, distance = row
    data = _hospital_to_dict(hospital)
    data["distance_m"] = round(distance, 1) if distance is not None else None
    return data


# ---------------------------------------------------------------------------
# Supply levels
# ---------------------------------------------------------------------------

async def update_supply_levels(
    db: AsyncSession,
    hospital_id: uuid.UUID,
    supply_levels: dict[str, str],
) -> dict[str, Any] | None:
    """Merge *supply_levels* into the hospital's JSONB column."""
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        return None

    current = hospital.supply_levels or {}
    current.update(supply_levels)
    hospital.supply_levels = current
    hospital.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(hospital)
    logger.info("Updated supply levels for hospital %s", hospital_id)
    return _hospital_to_dict(hospital)
