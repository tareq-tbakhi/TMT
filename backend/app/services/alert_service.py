"""
Alert service — creation, severity classification, spatial patient matching,
and acknowledgement workflow.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertSeverity, EventType
from app.models.patient import Patient, MobilityStatus, LivingSituation
from app.api.websocket.handler import broadcast_alert, notify_patient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


# Severity auto-classification heuristics — maps (event_type, confidence) to
# a baseline severity.  Routes can override when the user/Telegram NLP provides
# an explicit severity.
_SEVERITY_MAP: dict[EventType, AlertSeverity] = {
    EventType.BOMBING: AlertSeverity.CRITICAL,
    EventType.SHOOTING: AlertSeverity.CRITICAL,
    EventType.CHEMICAL: AlertSeverity.CRITICAL,
    EventType.BUILDING_COLLAPSE: AlertSeverity.HIGH,
    EventType.EARTHQUAKE: AlertSeverity.HIGH,
    EventType.FIRE: AlertSeverity.HIGH,
    EventType.FLOOD: AlertSeverity.MEDIUM,
    EventType.INFRASTRUCTURE: AlertSeverity.MEDIUM,
    EventType.MEDICAL_EMERGENCY: AlertSeverity.MEDIUM,
    EventType.OTHER: AlertSeverity.LOW,
}


def classify_severity(
    event_type: EventType,
    confidence: float = 0.5,
    override: AlertSeverity | str | None = None,
) -> AlertSeverity:
    """Determine alert severity from event type and confidence.

    If an explicit *override* is provided it takes precedence.  Otherwise the
    heuristic bumps the baseline severity up one level when confidence >= 0.8.
    """
    if override is not None:
        return AlertSeverity(override) if isinstance(override, str) else override

    baseline = _SEVERITY_MAP.get(event_type, AlertSeverity.LOW)
    if confidence >= 0.8 and baseline != AlertSeverity.CRITICAL:
        # Promote one level
        order = [AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH, AlertSeverity.CRITICAL]
        idx = order.index(baseline)
        return order[min(idx + 1, len(order) - 1)]
    return baseline


def _alert_to_dict(alert: Alert) -> dict[str, Any]:
    return {
        "id": str(alert.id),
        "event_type": alert.event_type.value if alert.event_type else None,
        "severity": alert.severity.value if alert.severity else None,
        "latitude": alert.latitude,
        "longitude": alert.longitude,
        "radius_m": alert.radius_m,
        "title": alert.title,
        "details": alert.details,
        "source": alert.source,
        "confidence": alert.confidence,
        "acknowledged": alert.acknowledged,
        "metadata": alert.metadata_,
        "affected_patients_count": alert.affected_patients_count,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "expires_at": alert.expires_at.isoformat() if alert.expires_at else None,
    }


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

async def create_alert(
    db: AsyncSession,
    *,
    event_type: str | EventType,
    latitude: float,
    longitude: float,
    title: str,
    radius_m: float = 1000,
    details: str | None = None,
    source: str | None = None,
    confidence: float = 0.5,
    severity_override: str | AlertSeverity | None = None,
    metadata: dict[str, Any] | None = None,
    expires_hours: int | None = 24,
    broadcast: bool = True,
    notify_patients: bool = True,
) -> dict[str, Any]:
    """Create an alert, compute affected patients, and broadcast.

    Parameters
    ----------
    notify_patients
        When ``True`` each affected patient receives a personal WS
        notification (best-effort, failures are logged but do not block).
    """
    if isinstance(event_type, str):
        event_type = EventType(event_type)

    severity = classify_severity(event_type, confidence, severity_override)

    alert = Alert(
        id=uuid.uuid4(),
        event_type=event_type,
        severity=severity,
        latitude=latitude,
        longitude=longitude,
        location=_make_point(longitude, latitude),
        radius_m=radius_m,
        title=title,
        details=details,
        source=source,
        confidence=confidence,
        metadata_=metadata or {},
        affected_patients_count=0,
        expires_at=datetime.utcnow() + timedelta(hours=expires_hours) if expires_hours else None,
    )
    db.add(alert)
    await db.flush()

    # Count and optionally notify affected patients
    affected = await find_affected_patients(db, alert_id=alert.id)
    alert.affected_patients_count = len(affected)
    await db.flush()
    await db.refresh(alert)

    payload = _alert_to_dict(alert)

    # Broadcast to all dashboards
    if broadcast:
        try:
            await broadcast_alert(payload)
        except Exception:
            logger.exception("Failed to broadcast alert %s", alert.id)

    # Notify each affected patient individually
    if notify_patients:
        for p in affected:
            try:
                await notify_patient(p["id"], payload)
            except Exception:
                logger.debug("Could not notify patient %s for alert %s", p["id"], alert.id)

    logger.info(
        "Created alert %s [%s/%s] — %d affected patients",
        alert.id, event_type.value, severity.value, len(affected),
    )
    return payload


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

async def get_alert(db: AsyncSession, alert_id: uuid.UUID) -> dict[str, Any] | None:
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    return _alert_to_dict(alert) if alert else None


async def get_alerts(
    db: AsyncSession,
    *,
    severity: str | AlertSeverity | None = None,
    event_type: str | EventType | None = None,
    active_only: bool = True,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Paginated alert list with optional filters.

    *active_only* filters out alerts whose ``expires_at`` is in the past.
    """
    query = select(Alert).order_by(Alert.created_at.desc()).limit(limit).offset(offset)

    if active_only:
        query = query.where(
            (Alert.expires_at.is_(None)) | (Alert.expires_at > datetime.utcnow())
        )

    if severity is not None:
        if isinstance(severity, str):
            severity = AlertSeverity(severity)
        query = query.where(Alert.severity == severity)

    if event_type is not None:
        if isinstance(event_type, str):
            event_type = EventType(event_type)
        query = query.where(Alert.event_type == event_type)

    result = await db.execute(query)
    return [_alert_to_dict(a) for a in result.scalars().all()]


async def get_alerts_near(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_m: float = 10_000,
    *,
    active_only: bool = True,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return alerts whose epicentre is within *radius_m* of a point."""
    centre = _make_point(longitude, latitude)
    query = (
        select(Alert)
        .where(
            Alert.location.isnot(None),
            func.ST_DWithin(
                Alert.location.cast(func.Geography),
                centre.cast(func.Geography),
                radius_m,
            ),
        )
        .order_by(Alert.created_at.desc())
        .limit(limit)
    )
    if active_only:
        query = query.where(
            (Alert.expires_at.is_(None)) | (Alert.expires_at > datetime.utcnow())
        )
    result = await db.execute(query)
    return [_alert_to_dict(a) for a in result.scalars().all()]


# ---------------------------------------------------------------------------
# Acknowledgement
# ---------------------------------------------------------------------------

async def acknowledge_alert(
    db: AsyncSession,
    alert_id: uuid.UUID,
    hospital_id: uuid.UUID,
) -> dict[str, Any] | None:
    """Mark an alert as acknowledged by a hospital.

    Stores the hospital ID in ``acknowledged`` and returns the updated alert.
    """
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        return None

    alert.acknowledged = str(hospital_id)
    await db.flush()
    await db.refresh(alert)
    logger.info("Alert %s acknowledged by hospital %s", alert_id, hospital_id)
    return _alert_to_dict(alert)


# ---------------------------------------------------------------------------
# Affected-patient matching (PostGIS)
# ---------------------------------------------------------------------------

async def find_affected_patients(
    db: AsyncSession,
    *,
    alert_id: uuid.UUID | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    radius_m: float | None = None,
) -> list[dict[str, Any]]:
    """Find patients within an alert's radius.

    Can be called with an existing *alert_id* (radius and location are read
    from the DB row) or with explicit coordinates and radius.
    """
    if alert_id is not None:
        res = await db.execute(select(Alert).where(Alert.id == alert_id))
        alert = res.scalar_one_or_none()
        if alert is None:
            return []
        latitude = alert.latitude
        longitude = alert.longitude
        radius_m = alert.radius_m

    if latitude is None or longitude is None or radius_m is None:
        raise ValueError("Either alert_id or (latitude, longitude, radius_m) must be provided")

    centre = _make_point(longitude, latitude)
    query = (
        select(Patient)
        .where(
            Patient.location.isnot(None),
            Patient.is_active.is_(True),
            func.ST_DWithin(
                Patient.location.cast(func.Geography),
                centre.cast(func.Geography),
                radius_m,
            ),
        )
        .order_by(
            func.ST_Distance(
                Patient.location.cast(func.Geography),
                centre.cast(func.Geography),
            )
        )
    )
    result = await db.execute(query)
    patients = result.scalars().all()

    return [
        {
            "id": str(p.id),
            "phone": p.phone,
            "name": p.name,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "mobility": p.mobility.value if p.mobility else None,
            "living_situation": p.living_situation.value if p.living_situation else None,
        }
        for p in patients
    ]


async def find_affected_vulnerable_patients(
    db: AsyncSession,
    alert_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Same as ``find_affected_patients`` but limited to vulnerable individuals.

    Useful for generating the evacuation-priority sub-list.
    """
    res = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = res.scalar_one_or_none()
    if alert is None:
        return []

    centre = _make_point(alert.longitude, alert.latitude)
    query = (
        select(Patient)
        .where(
            Patient.location.isnot(None),
            Patient.is_active.is_(True),
            func.ST_DWithin(
                Patient.location.cast(func.Geography),
                centre.cast(func.Geography),
                alert.radius_m,
            ),
            and_(
                (Patient.mobility.in_([
                    MobilityStatus.WHEELCHAIR,
                    MobilityStatus.BEDRIDDEN,
                    MobilityStatus.OTHER,
                ]))
                | (Patient.living_situation == LivingSituation.ALONE)
            ),
        )
        .order_by(
            func.ST_Distance(
                Patient.location.cast(func.Geography),
                centre.cast(func.Geography),
            )
        )
    )
    result = await db.execute(query)
    patients = result.scalars().all()

    return [
        {
            "id": str(p.id),
            "phone": p.phone,
            "name": p.name,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "mobility": p.mobility.value if p.mobility else None,
            "living_situation": p.living_situation.value if p.living_situation else None,
        }
        for p in patients
    ]
