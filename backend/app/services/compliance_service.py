"""
Compliance service — consent tracking, audit-log queries, and data-retention
enforcement.

All data-processing in TMT requires explicit patient consent.  This module
provides the primitives for recording, checking, and revoking consent as well
as querying the audit trail and purging stale data in line with retention
policy.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient
from app.models.audit_log import AuditLog
from app.models.medical_record import MedicalRecord
from app.models.sms_log import SmsLog
from app.models.sos_request import SosRequest, SOSStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Consent tracking
# ---------------------------------------------------------------------------

async def record_consent(
    db: AsyncSession,
    patient_id: uuid.UUID,
    *,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Record that a patient has given data-processing consent.

    Creates an audit-log entry capturing *who* triggered the action and from
    where.  Returns the updated consent timestamp.
    """
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise ValueError(f"Patient {patient_id} not found")

    now = datetime.utcnow()
    patient.consent_given_at = now
    patient.updated_at = now

    audit = AuditLog(
        user_id=user_id,
        action="consent_granted",
        resource="patient",
        resource_id=str(patient_id),
        details=f"Patient granted data-processing consent at {now.isoformat()}",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(audit)
    await db.flush()
    await db.refresh(patient)

    logger.info("Consent recorded for patient %s", patient_id)
    return {
        "patient_id": str(patient_id),
        "consent_given_at": patient.consent_given_at.isoformat(),
    }


async def revoke_consent(
    db: AsyncSession,
    patient_id: uuid.UUID,
    *,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Revoke a patient's data-processing consent and audit the action."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise ValueError(f"Patient {patient_id} not found")

    patient.consent_given_at = None
    patient.updated_at = datetime.utcnow()

    audit = AuditLog(
        user_id=user_id,
        action="consent_revoked",
        resource="patient",
        resource_id=str(patient_id),
        details="Patient revoked data-processing consent.",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(audit)
    await db.flush()
    await db.refresh(patient)

    logger.info("Consent revoked for patient %s", patient_id)
    return {
        "patient_id": str(patient_id),
        "consent_given_at": None,
    }


async def check_consent(db: AsyncSession, patient_id: uuid.UUID) -> dict[str, Any]:
    """Return the consent status for a patient.

    Returns:
        ``{patient_id, has_consent, consent_given_at}``
    """
    result = await db.execute(
        select(Patient.consent_given_at).where(Patient.id == patient_id)
    )
    consent_at = result.scalar_one_or_none()

    if consent_at is None:
        # Could be patient-not-found OR consent-not-given.  Distinguish:
        exists = await db.execute(
            select(func.count(Patient.id)).where(Patient.id == patient_id)
        )
        if exists.scalar_one() == 0:
            raise ValueError(f"Patient {patient_id} not found")

    return {
        "patient_id": str(patient_id),
        "has_consent": consent_at is not None,
        "consent_given_at": consent_at.isoformat() if consent_at else None,
    }


async def require_consent(db: AsyncSession, patient_id: uuid.UUID) -> bool:
    """Raise ``PermissionError`` if the patient has not consented.

    Intended as a guard in service functions that process PII.
    """
    status = await check_consent(db, patient_id)
    if not status["has_consent"]:
        raise PermissionError(
            f"Patient {patient_id} has not given data-processing consent"
        )
    return True


# ---------------------------------------------------------------------------
# Audit trail queries
# ---------------------------------------------------------------------------

async def get_audit_trail(
    db: AsyncSession,
    *,
    resource: str | None = None,
    resource_id: str | None = None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Query audit-log entries with flexible filters.

    All filter parameters are optional; when omitted the corresponding
    predicate is skipped, so calling with no arguments returns the most
    recent entries.
    """
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)

    if resource is not None:
        query = query.where(AuditLog.resource == resource)
    if resource_id is not None:
        query = query.where(AuditLog.resource_id == resource_id)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if since is not None:
        query = query.where(AuditLog.created_at >= since)
    if until is not None:
        query = query.where(AuditLog.created_at <= until)

    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "user_id": str(e.user_id) if e.user_id else None,
            "action": e.action,
            "resource": e.resource,
            "resource_id": e.resource_id,
            "details": e.details,
            "ip_address": e.ip_address,
            "user_agent": e.user_agent,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


async def get_audit_trail_for_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    *,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Convenience wrapper: all audit entries related to a specific patient."""
    return await get_audit_trail(
        db,
        resource="patient",
        resource_id=str(patient_id),
        limit=limit,
        offset=offset,
    )


async def count_audit_entries(
    db: AsyncSession,
    *,
    resource: str | None = None,
    action: str | None = None,
) -> int:
    query = select(func.count(AuditLog.id))
    if resource:
        query = query.where(AuditLog.resource == resource)
    if action:
        query = query.where(AuditLog.action == action)
    result = await db.execute(query)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Data-retention enforcement
# ---------------------------------------------------------------------------

async def enforce_data_retention(
    db: AsyncSession,
    *,
    sms_retention_days: int = 90,
    resolved_sos_retention_days: int = 365,
    audit_retention_days: int = 730,  # 2 years
    inactive_patient_days: int = 365,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Purge records that exceed the configured retention periods.

    When *dry_run* is ``True`` the function counts what *would* be deleted
    without actually removing anything.

    Returns a summary dict with counts per category.
    """
    now = datetime.utcnow()
    summary: dict[str, int] = {}

    # 1. Old SMS logs
    sms_cutoff = now - timedelta(days=sms_retention_days)
    sms_count_q = select(func.count(SmsLog.id)).where(SmsLog.created_at < sms_cutoff)
    sms_count = (await db.execute(sms_count_q)).scalar_one()
    summary["sms_logs"] = sms_count
    if not dry_run and sms_count > 0:
        await db.execute(delete(SmsLog).where(SmsLog.created_at < sms_cutoff))
        logger.info("Purged %d SMS log entries older than %d days", sms_count, sms_retention_days)

    # 2. Resolved SOS requests
    sos_cutoff = now - timedelta(days=resolved_sos_retention_days)
    sos_count_q = (
        select(func.count(SosRequest.id))
        .where(
            SosRequest.status == SOSStatus.RESOLVED,
            SosRequest.resolved_at.isnot(None),
            SosRequest.resolved_at < sos_cutoff,
        )
    )
    sos_count = (await db.execute(sos_count_q)).scalar_one()
    summary["resolved_sos_requests"] = sos_count
    if not dry_run and sos_count > 0:
        await db.execute(
            delete(SosRequest).where(
                SosRequest.status == SOSStatus.RESOLVED,
                SosRequest.resolved_at.isnot(None),
                SosRequest.resolved_at < sos_cutoff,
            )
        )
        logger.info("Purged %d resolved SOS requests older than %d days", sos_count, resolved_sos_retention_days)

    # 3. Old audit logs
    audit_cutoff = now - timedelta(days=audit_retention_days)
    audit_count_q = select(func.count(AuditLog.id)).where(AuditLog.created_at < audit_cutoff)
    audit_count = (await db.execute(audit_count_q)).scalar_one()
    summary["audit_logs"] = audit_count
    if not dry_run and audit_count > 0:
        await db.execute(delete(AuditLog).where(AuditLog.created_at < audit_cutoff))
        logger.info("Purged %d audit log entries older than %d days", audit_count, audit_retention_days)

    # 4. Medical records for long-inactive patients who have revoked consent
    inactive_cutoff = now - timedelta(days=inactive_patient_days)
    inactive_patients_q = (
        select(Patient.id)
        .where(
            Patient.is_active.is_(False),
            Patient.updated_at < inactive_cutoff,
            Patient.consent_given_at.is_(None),
        )
    )
    inactive_ids = [row[0] for row in (await db.execute(inactive_patients_q)).all()]
    mr_count = 0
    if inactive_ids:
        mr_count_q = (
            select(func.count(MedicalRecord.id))
            .where(MedicalRecord.patient_id.in_(inactive_ids))
        )
        mr_count = (await db.execute(mr_count_q)).scalar_one()
        if not dry_run and mr_count > 0:
            await db.execute(
                delete(MedicalRecord).where(MedicalRecord.patient_id.in_(inactive_ids))
            )
            logger.info(
                "Purged %d medical records for %d inactive/no-consent patients",
                mr_count, len(inactive_ids),
            )
    summary["medical_records_inactive_patients"] = mr_count
    summary["inactive_patients_checked"] = len(inactive_ids)

    if not dry_run:
        await db.flush()

    summary["dry_run"] = dry_run
    logger.info("Data retention enforcement complete: %s", summary)
    return summary
