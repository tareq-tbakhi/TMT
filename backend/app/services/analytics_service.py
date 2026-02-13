"""
Analytics service — aggregated dashboard stats, heatmap generation,
time-series data, supply-level summaries, and top-conditions breakdown.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient, MobilityStatus
from app.models.hospital import Hospital, HospitalStatus
from app.models.alert import Alert, AlertSeverity
from app.models.sos_request import SosRequest, SOSStatus
from app.models.geo_event import GeoEvent
from app.models.medical_record import MedicalRecord

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------

async def get_dashboard_stats(db: AsyncSession) -> dict[str, Any]:
    """Return a single object with high-level counts for the dashboard header.

    Fields returned:
    - total_patients, active_patients, vulnerable_patients
    - total_hospitals, operational_hospitals
    - active_alerts, critical_alerts
    - open_sos, resolved_sos_24h
    """
    now = datetime.utcnow()

    # --- patients ---
    total_patients_q = select(func.count(Patient.id))
    active_patients_q = select(func.count(Patient.id)).where(Patient.is_active.is_(True))
    vulnerable_patients_q = (
        select(func.count(Patient.id))
        .where(
            Patient.is_active.is_(True),
            Patient.mobility.in_([
                MobilityStatus.WHEELCHAIR,
                MobilityStatus.BEDRIDDEN,
                MobilityStatus.OTHER,
            ]),
        )
    )

    # --- hospitals ---
    total_hospitals_q = select(func.count(Hospital.id))
    operational_hospitals_q = (
        select(func.count(Hospital.id))
        .where(Hospital.status == HospitalStatus.OPERATIONAL)
    )
    total_beds_q = select(func.coalesce(func.sum(Hospital.available_beds), 0))
    total_icu_q = select(func.coalesce(func.sum(Hospital.icu_beds), 0))

    # --- alerts ---
    active_alerts_q = (
        select(func.count(Alert.id))
        .where(
            (Alert.expires_at.is_(None)) | (Alert.expires_at > now)
        )
    )
    critical_alerts_q = (
        select(func.count(Alert.id))
        .where(
            Alert.severity == AlertSeverity.CRITICAL,
            (Alert.expires_at.is_(None)) | (Alert.expires_at > now),
        )
    )

    # --- SOS ---
    open_sos_q = (
        select(func.count(SosRequest.id))
        .where(SosRequest.status.in_([SOSStatus.PENDING, SOSStatus.ACKNOWLEDGED, SOSStatus.DISPATCHED]))
    )
    resolved_24h_q = (
        select(func.count(SosRequest.id))
        .where(
            SosRequest.status == SOSStatus.RESOLVED,
            SosRequest.resolved_at >= now - timedelta(hours=24),
        )
    )

    # Execute each count individually (clean async pattern)
    total_patients = (await db.execute(total_patients_q)).scalar_one()
    active_patients = (await db.execute(active_patients_q)).scalar_one()
    vulnerable_patients = (await db.execute(vulnerable_patients_q)).scalar_one()
    total_hospitals = (await db.execute(total_hospitals_q)).scalar_one()
    operational_hospitals = (await db.execute(operational_hospitals_q)).scalar_one()
    total_beds = (await db.execute(total_beds_q)).scalar_one()
    total_icu = (await db.execute(total_icu_q)).scalar_one()
    active_alerts = (await db.execute(active_alerts_q)).scalar_one()
    critical_alerts = (await db.execute(critical_alerts_q)).scalar_one()
    open_sos = (await db.execute(open_sos_q)).scalar_one()
    resolved_24h = (await db.execute(resolved_24h_q)).scalar_one()

    return {
        "total_patients": total_patients,
        "active_patients": active_patients,
        "vulnerable_patients": vulnerable_patients,
        "patients_at_risk": vulnerable_patients,
        "total_hospitals": total_hospitals,
        "operational_hospitals": operational_hospitals,
        "total_available_beds": total_beds,
        "total_icu_beds": total_icu,
        "active_alerts": active_alerts,
        "critical_alerts": critical_alerts,
        "pending_sos": open_sos,
        "resolved_sos_today": resolved_24h,
    }


# ---------------------------------------------------------------------------
# Heatmap data
# ---------------------------------------------------------------------------

async def get_heatmap_data(
    db: AsyncSession,
    *,
    layer: str = "all",
    hours: int = 48,
) -> list[dict[str, Any]]:
    """Return ``[{latitude, longitude, weight}, ...]`` suitable for a
    front-end heatmap overlay.

    *layer* can be ``"sos"``, ``"alert"``, ``"patient"``, or ``"all"``
    (which combines SOS + alerts).
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    points: list[dict[str, Any]] = []

    if layer in ("sos", "all"):
        sos_q = (
            select(SosRequest.latitude, SosRequest.longitude, SosRequest.severity)
            .where(SosRequest.created_at >= cutoff, SosRequest.latitude.isnot(None))
        )
        sos_rows = (await db.execute(sos_q)).all()
        for lat, lon, sev in sos_rows:
            points.append({"latitude": lat, "longitude": lon, "weight": (sev or 3) / 5.0, "type": "sos"})

    if layer in ("alert", "all"):
        severity_weight = {
            AlertSeverity.LOW: 0.25,
            AlertSeverity.MEDIUM: 0.5,
            AlertSeverity.HIGH: 0.75,
            AlertSeverity.CRITICAL: 1.0,
        }
        alert_q = (
            select(Alert.latitude, Alert.longitude, Alert.severity)
            .where(Alert.created_at >= cutoff, Alert.latitude.isnot(None))
        )
        alert_rows = (await db.execute(alert_q)).all()
        for lat, lon, sev in alert_rows:
            points.append({
                "latitude": lat,
                "longitude": lon,
                "weight": severity_weight.get(sev, 0.5),
                "type": "alert",
            })

    if layer == "patient":
        patient_q = (
            select(Patient.latitude, Patient.longitude)
            .where(Patient.is_active.is_(True), Patient.latitude.isnot(None))
        )
        patient_rows = (await db.execute(patient_q)).all()
        for lat, lon in patient_rows:
            points.append({"latitude": lat, "longitude": lon, "weight": 0.3, "type": "patient"})

    return points


# ---------------------------------------------------------------------------
# Casualty / SOS timeline
# ---------------------------------------------------------------------------

async def get_casualty_timeline(
    db: AsyncSession,
    *,
    days: int = 14,
    bucket: str = "day",
) -> list[dict[str, Any]]:
    """Return a time-series of SOS request counts bucketed by day or hour.

    Each entry: ``{date, total, pending, resolved, severity_avg}``.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    if bucket == "hour":
        trunc_expr = func.date_trunc("hour", SosRequest.created_at).label("bucket")
    else:
        trunc_expr = func.date_trunc("day", SosRequest.created_at).label("bucket")

    query = (
        select(
            trunc_expr,
            func.count(SosRequest.id).label("total"),
            func.count(case(
                (SosRequest.status == SOSStatus.PENDING, SosRequest.id),
            )).label("pending"),
            func.count(case(
                (SosRequest.status == SOSStatus.RESOLVED, SosRequest.id),
            )).label("resolved"),
            func.coalesce(func.avg(SosRequest.severity), 0).label("severity_avg"),
        )
        .where(SosRequest.created_at >= cutoff)
        .group_by(trunc_expr)
        .order_by(trunc_expr)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "date": row.bucket.isoformat() if row.bucket else None,
            "total": row.total,
            "pending": row.pending,
            "resolved": row.resolved,
            "severity_avg": round(float(row.severity_avg), 2),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Supply levels
# ---------------------------------------------------------------------------

async def get_supply_levels(db: AsyncSession) -> list[dict[str, Any]]:
    """Return per-hospital supply snapshots.

    Each entry: ``{hospital_id, hospital_name, status, supply_levels, available_beds}``.
    """
    query = (
        select(Hospital)
        .where(Hospital.status != HospitalStatus.DESTROYED)
        .order_by(Hospital.name)
    )
    result = await db.execute(query)
    hospitals = result.scalars().all()

    return [
        {
            "hospital_id": str(h.id),
            "hospital_name": h.name,
            "status": h.status.value if h.status else None,
            "supply_levels": h.supply_levels or {},
            "available_beds": h.available_beds,
            "bed_capacity": h.bed_capacity,
            "icu_beds": h.icu_beds,
        }
        for h in hospitals
    ]


async def get_supply_summary(db: AsyncSession) -> dict[str, Any]:
    """Aggregate supply levels across all operational hospitals.

    Returns counts of hospitals by category (e.g. how many have ``blood: low``).
    """
    query = select(Hospital.supply_levels).where(
        Hospital.status.in_([HospitalStatus.OPERATIONAL, HospitalStatus.LIMITED])
    )
    result = await db.execute(query)
    all_levels = [row[0] or {} for row in result.all()]

    # Build aggregation: {category: {high: N, medium: N, low: N, critical: N}}
    summary: dict[str, dict[str, int]] = {}
    for levels in all_levels:
        for category, level in levels.items():
            if category not in summary:
                summary[category] = {"high": 0, "medium": 0, "low": 0, "critical": 0, "unknown": 0}
            level_str = str(level).lower()
            if level_str in summary[category]:
                summary[category][level_str] += 1
            else:
                summary[category]["unknown"] += 1

    return {
        "hospital_count": len(all_levels),
        "categories": summary,
    }


# ---------------------------------------------------------------------------
# Top conditions
# ---------------------------------------------------------------------------

async def get_top_conditions(
    db: AsyncSession,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return the most frequent medical conditions across all patients.

    Each entry: ``{condition, count}``.  Data is sourced from
    ``MedicalRecord.conditions`` (a JSONB array).
    """
    # Use jsonb_array_elements_text to unnest the JSONB array
    unnest = (
        select(
            func.jsonb_array_elements_text(MedicalRecord.conditions).label("condition"),
        )
        .where(MedicalRecord.conditions.isnot(None))
        .subquery()
    )

    query = (
        select(
            unnest.c.condition,
            func.count().label("cnt"),
        )
        .group_by(unnest.c.condition)
        .order_by(func.count().desc())
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    return [{"condition": row.condition, "count": row.cnt} for row in rows]


# ---------------------------------------------------------------------------
# Alert breakdown by severity
# ---------------------------------------------------------------------------

async def get_alert_breakdown(
    db: AsyncSession,
    *,
    hours: int = 168,  # 7 days
) -> dict[str, int]:
    """Count alerts by severity within the last *hours*."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    query = (
        select(Alert.severity, func.count(Alert.id))
        .where(Alert.created_at >= cutoff)
        .group_by(Alert.severity)
    )
    result = await db.execute(query)
    return {sev.value: cnt for sev, cnt in result.all()}


# ---------------------------------------------------------------------------
# SOS by source
# ---------------------------------------------------------------------------

async def get_sos_by_source(
    db: AsyncSession,
    *,
    days: int = 30,
) -> dict[str, int]:
    """Count SOS requests by source (api / sms) within the last *days*."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    query = (
        select(SosRequest.source, func.count(SosRequest.id))
        .where(SosRequest.created_at >= cutoff)
        .group_by(SosRequest.source)
    )
    result = await db.execute(query)
    return {src.value if src else "unknown": cnt for src, cnt in result.all()}


# ---------------------------------------------------------------------------
# Hospital occupancy trend
# ---------------------------------------------------------------------------

async def get_hospital_occupancy(db: AsyncSession) -> list[dict[str, Any]]:
    """Current bed utilisation per hospital (snapshot, not time-series)."""
    query = (
        select(Hospital)
        .where(Hospital.status != HospitalStatus.DESTROYED)
        .order_by(Hospital.name)
    )
    result = await db.execute(query)
    hospitals = result.scalars().all()

    return [
        {
            "hospital_id": str(h.id),
            "hospital_name": h.name,
            "bed_capacity": h.bed_capacity,
            "available_beds": h.available_beds,
            "occupancy_pct": (
                round((1 - h.available_beds / h.bed_capacity) * 100, 1)
                if h.bed_capacity and h.bed_capacity > 0
                else None
            ),
            "icu_beds": h.icu_beds,
            "status": h.status.value if h.status else None,
        }
        for h in hospitals
    ]
