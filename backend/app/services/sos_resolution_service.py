"""
SOS auto-resolution service.

Monitors patient location updates and automatically resolves SOS requests
when the patient reaches an operational hospital.

Rules:
- Patient within HOSPITAL_ARRIVAL_RADIUS_M of an OPERATIONAL hospital → resolve
- If SOS originated from a hospital (origin_hospital_id set), only resolve
  when the patient reaches a DIFFERENT operational hospital
- Low trust-score patients (< MIN_TRUST_SCORE_FOR_AUTO_RESOLVE) are skipped
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sos_request import SosRequest, SOSStatus
from app.models.patient import Patient
from app.services import hospital_service

logger = logging.getLogger(__name__)

# Patient must be within 500 m of a hospital to count as "arrived"
HOSPITAL_ARRIVAL_RADIUS_M = 500

# Don't auto-resolve for patients with very low trust scores
MIN_TRUST_SCORE_FOR_AUTO_RESOLVE = 0.3


async def check_and_resolve(
    db: AsyncSession,
    patient_id: uuid.UUID,
    latitude: float,
    longitude: float,
) -> list[dict[str, Any]]:
    """Check if a patient's new location triggers SOS auto-resolution.

    Returns a list of resolution payloads (one per resolved SOS) that the
    caller should broadcast via WebSocket.
    """
    # 1. Find all active SOS for this patient
    active_statuses = [SOSStatus.PENDING, SOSStatus.ACKNOWLEDGED, SOSStatus.DISPATCHED]
    result = await db.execute(
        select(SosRequest).where(
            SosRequest.patient_id == patient_id,
            SosRequest.status.in_(active_statuses),
        )
    )
    active_sos = result.scalars().all()

    if not active_sos:
        return []

    # 2. Find nearest operational hospital within arrival radius
    nearby_hospitals = await hospital_service.find_nearest_hospitals(
        db,
        latitude,
        longitude,
        radius_m=HOSPITAL_ARRIVAL_RADIUS_M,
        limit=1,
        operational_only=True,
    )

    if not nearby_hospitals:
        return []

    nearby_hospital = nearby_hospitals[0]
    nearby_hospital_id = nearby_hospital["id"]

    # 3. Check patient trust score
    p_result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = p_result.scalar_one_or_none()
    if patient is None:
        return []

    trust_score = patient.trust_score if patient.trust_score is not None else 1.0
    if trust_score < MIN_TRUST_SCORE_FOR_AUTO_RESOLVE:
        logger.warning(
            "Skipping auto-resolve for patient %s — trust_score=%.2f < %.2f",
            patient_id, trust_score, MIN_TRUST_SCORE_FOR_AUTO_RESOLVE,
        )
        return []

    # 4. Evaluate each active SOS
    resolutions: list[dict[str, Any]] = []
    now = datetime.utcnow()

    for sos in active_sos:
        origin_id = str(sos.origin_hospital_id) if sos.origin_hospital_id else None

        if origin_id and origin_id == nearby_hospital_id:
            # SOS started at this hospital (hospital under attack) — do NOT resolve
            logger.info(
                "SOS %s originated from hospital %s — patient still there, not resolving",
                sos.id, origin_id,
            )
            continue

        # Resolve: either no origin hospital, or patient reached a different hospital
        sos.status = SOSStatus.RESOLVED
        sos.resolved_at = now
        sos.auto_resolved = True

        resolutions.append({
            "sos_id": str(sos.id),
            "patient_id": str(patient_id),
            "patient_name": patient.name,
            "latitude": latitude,
            "longitude": longitude,
            "hospital_id": nearby_hospital_id,
            "hospital_name": nearby_hospital.get("name", "Unknown"),
            "origin_hospital_id": origin_id,
            "resolved_at": now.isoformat(),
            "auto_resolved": True,
        })

        logger.info(
            "Auto-resolved SOS %s — patient %s reached hospital %s (%s)",
            sos.id, patient_id, nearby_hospital_id, nearby_hospital.get("name"),
        )

    if resolutions:
        await db.flush()

    return resolutions
