"""
GDPR privacy routes (features 11.3.2 / 11.3.3).

Endpoints:
    GET    /privacy/export — Data portability (GDPR Art. 20): full
                             machine-readable JSON export of the caller's data.
    DELETE /privacy/me     — Right to erasure (GDPR Art. 17): a patient erases
                             their own account and personal data.

Erasure strategy (dictated by the schema):
    - Medical records and SMS logs are hard-deleted (nothing references them).
    - SOS requests have a NOT NULL FK to the patient and document emergency
      response actions (GDPR Art. 17(3) retention grounds), so the rows are
      kept but scrubbed of free-text/transcript PII and left pointing at an
      anonymized patient record.
    - The patient row is anonymized in place (unique NOT NULL phone gets a
      random placeholder) and deactivated; the user account likewise.
    - All of the user's tokens are revoked immediately.

Both endpoints are authenticated, rate-limited, and audit-logged.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.medical_record import MedicalRecord
from app.models.sms_log import SmsLog
from app.models.sos_request import SosRequest
from app.models.audit_log import AuditLog
from app.api.middleware.auth import get_current_user, get_revocation_store, hash_password
from app.api.middleware.audit import log_audit
from app.api.middleware.rate_limit import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ErasureSummary(BaseModel):
    status: str = "success"
    detail: str
    patient_id: Optional[str] = None
    medical_records_deleted: int = 0
    sms_logs_deleted: int = 0
    sos_requests_scrubbed: int = 0
    patient_anonymized: bool = False
    user_anonymized: bool = True
    tokens_revoked: bool = True


# ---------------------------------------------------------------------------
# Serialization helpers (defensive: tolerate concurrent model evolution)
# ---------------------------------------------------------------------------

def _iso(value: Any) -> Optional[str]:
    """ISO-8601 or None for datetimes/dates."""
    return value.isoformat() if value is not None else None


def _enum(value: Any) -> Optional[str]:
    """Enum -> value, passthrough for plain strings."""
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _user_to_export(user: User) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "phone": user.phone,
        "email": user.email,
        "role": _enum(user.role),
        "is_active": user.is_active,
        "hospital_id": str(user.hospital_id) if user.hospital_id else None,
        "patient_id": str(user.patient_id) if user.patient_id else None,
        "created_at": _iso(user.created_at),
        "updated_at": _iso(user.updated_at),
    }


def _patient_to_export(patient: Patient) -> dict[str, Any]:
    return {
        "id": str(patient.id),
        "phone": patient.phone,
        "name": patient.name,
        "date_of_birth": _iso(getattr(patient, "date_of_birth", None)),
        "gender": _enum(getattr(patient, "gender", None)),
        "national_id": getattr(patient, "national_id", None),
        "primary_language": getattr(patient, "primary_language", None),
        "latitude": patient.latitude,
        "longitude": patient.longitude,
        "location_name": getattr(patient, "location_name", None),
        "mobility": _enum(patient.mobility),
        "living_situation": _enum(patient.living_situation),
        "blood_type": patient.blood_type,
        "height_cm": getattr(patient, "height_cm", None),
        "weight_kg": getattr(patient, "weight_kg", None),
        "chronic_conditions": getattr(patient, "chronic_conditions", None) or [],
        "allergies": getattr(patient, "allergies", None) or [],
        "current_medications": getattr(patient, "current_medications", None) or [],
        "special_equipment": getattr(patient, "special_equipment", None) or [],
        "insurance_info": getattr(patient, "insurance_info", None),
        "notes": getattr(patient, "notes", None),
        "emergency_contacts": patient.emergency_contacts or [],
        "consent_given_at": _iso(patient.consent_given_at),
        "trust_score": getattr(patient, "trust_score", None),
        "total_sos_count": getattr(patient, "total_sos_count", None),
        "false_alarm_count": getattr(patient, "false_alarm_count", None),
        "is_active": patient.is_active,
        "created_at": _iso(patient.created_at),
        "updated_at": _iso(patient.updated_at),
    }


def _medical_record_to_export(record: MedicalRecord) -> dict[str, Any]:
    return {
        "id": str(record.id),
        "patient_id": str(record.patient_id),
        "conditions": record.conditions or [],
        "medications": record.medications or [],
        "allergies": record.allergies or [],
        "special_equipment": record.special_equipment or [],
        "notes": record.notes,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
    }


def _sos_to_export(sos: SosRequest) -> dict[str, Any]:
    return {
        "id": str(sos.id),
        "status": _enum(sos.status),
        "patient_status": _enum(sos.patient_status),
        "severity": sos.severity,
        "source": _enum(sos.source),
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "details": sos.details,
        "triage_transcript": getattr(sos, "triage_transcript", None),
        "routed_department": getattr(sos, "routed_department", None),
        "auto_resolved": getattr(sos, "auto_resolved", None),
        "created_at": _iso(sos.created_at),
        "resolved_at": _iso(sos.resolved_at),
    }


def _sms_log_to_export(sms: SmsLog) -> dict[str, Any]:
    return {
        "id": str(sms.id),
        "direction": _enum(sms.direction),
        "phone": sms.phone,
        "message_body": sms.message_body,
        "decrypted": sms.decrypted,
        "delivery_status": sms.delivery_status,
        "created_at": _iso(sms.created_at),
    }


def _audit_to_export(entry: AuditLog) -> dict[str, Any]:
    return {
        "id": str(entry.id),
        "action": entry.action,
        "resource": entry.resource,
        "resource_id": entry.resource_id,
        "details": entry.details,
        "ip_address": entry.ip_address,
        "created_at": _iso(entry.created_at),
    }


# ---------------------------------------------------------------------------
# GET /privacy/export — data portability (GDPR Art. 20)
# ---------------------------------------------------------------------------

@router.get("/privacy/export",
            dependencies=[rate_limit(max_requests=5, window_seconds=3600,
                                     key_prefix="privacy", per_user=True)])
async def export_my_data(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all personal data held about the caller as machine-readable JSON.

    Patients receive their profile, medical records, SOS history, SMS logs and
    audit trail; staff accounts receive their account record and audit trail.
    """
    export: dict[str, Any] = {
        "export_format": "tmt-gdpr-export",
        "export_version": "1.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "legal_basis": "GDPR Article 20 — Right to data portability",
        "user": _user_to_export(current_user),
        "patient_profile": None,
        "medical_records": [],
        "sos_requests": [],
        "sms_logs": [],
        "audit_trail": [],
    }

    patient_id = current_user.patient_id
    if patient_id is not None:
        patient = (
            await db.execute(select(Patient).where(Patient.id == patient_id))
        ).scalar_one_or_none()
        if patient is not None:
            export["patient_profile"] = _patient_to_export(patient)

        records = (
            await db.execute(
                select(MedicalRecord)
                .where(MedicalRecord.patient_id == patient_id)
                .order_by(MedicalRecord.created_at)
            )
        ).scalars().all()
        export["medical_records"] = [_medical_record_to_export(r) for r in records]

        sos_rows = (
            await db.execute(
                select(SosRequest)
                .where(SosRequest.patient_id == patient_id)
                .order_by(SosRequest.created_at)
            )
        ).scalars().all()
        export["sos_requests"] = [_sos_to_export(s) for s in sos_rows]

        sms_rows = (
            await db.execute(
                select(SmsLog)
                .where(SmsLog.patient_id == patient_id)
                .order_by(SmsLog.created_at)
            )
        ).scalars().all()
        export["sms_logs"] = [_sms_log_to_export(s) for s in sms_rows]

    audit_filters = [AuditLog.user_id == current_user.id]
    if patient_id is not None:
        audit_filters.append(
            (AuditLog.resource == "patient") & (AuditLog.resource_id == str(patient_id))
        )
    audit_rows = (
        await db.execute(
            select(AuditLog)
            .where(or_(*audit_filters))
            .order_by(AuditLog.created_at.desc())
            .limit(5000)
        )
    ).scalars().all()
    export["audit_trail"] = [_audit_to_export(a) for a in audit_rows]

    await log_audit(
        action="export",
        resource="patient" if patient_id else "user",
        resource_id=str(patient_id or current_user.id),
        user_id=current_user.id,
        details=(
            "GDPR Art. 20 data export generated "
            f"({len(export['medical_records'])} medical records, "
            f"{len(export['sos_requests'])} SOS requests, "
            f"{len(export['sms_logs'])} SMS logs)"
        ),
        request=request,
        db=db,
    )

    return JSONResponse(
        content=export,
        headers={
            "Content-Disposition": (
                f'attachment; filename="tmt-data-export-{current_user.id}.json"'
            ),
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------------------------
# DELETE /privacy/me — right to erasure (GDPR Art. 17)
# ---------------------------------------------------------------------------

@router.delete("/privacy/me", response_model=ErasureSummary,
               dependencies=[rate_limit(max_requests=5, window_seconds=3600,
                                        key_prefix="privacy", per_user=True)])
async def erase_my_account(
    request: Request,
    confirm: bool = Query(
        False,
        description="Must be true — irreversibly erases the account and personal data.",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Erase the calling patient's account and personal data (GDPR Art. 17).

    Irreversible. Requires ``?confirm=true``. Only patient accounts are
    self-service; facility/admin accounts must be removed by a super admin
    (facility records depend on them).
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-service erasure is only available for patient accounts. "
                   "Contact a system administrator.",
        )
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erasure is irreversible. Repeat the request with ?confirm=true "
                   "to erase your account and personal data.",
        )

    summary = ErasureSummary(
        detail="Account and personal data erased",
        patient_id=str(current_user.patient_id) if current_user.patient_id else None,
    )
    placeholder = uuid.uuid4().hex[:12]

    patient_id = current_user.patient_id
    if patient_id is not None:
        # 1. Hard-delete medical records (nothing references them)
        result = await db.execute(
            delete(MedicalRecord).where(MedicalRecord.patient_id == patient_id)
        )
        summary.medical_records_deleted = result.rowcount or 0

        # 2. Hard-delete SMS logs (contain phone numbers / message bodies)
        result = await db.execute(
            delete(SmsLog).where(SmsLog.patient_id == patient_id)
        )
        summary.sms_logs_deleted = result.rowcount or 0

        # 3. Scrub SOS requests (rows retained per Art. 17(3) — emergency
        #    response record — but stripped of free-text and transcript PII)
        sos_rows = (
            await db.execute(
                select(SosRequest).where(SosRequest.patient_id == patient_id)
            )
        ).scalars().all()
        for sos in sos_rows:
            sos.details = None
            if hasattr(sos, "triage_transcript"):
                sos.triage_transcript = None
        summary.sos_requests_scrubbed = len(sos_rows)

        # 4. Anonymize the patient row in place (FKs keep pointing at a
        #    record that no longer identifies a natural person)
        patient = (
            await db.execute(select(Patient).where(Patient.id == patient_id))
        ).scalar_one_or_none()
        if patient is not None:
            patient.name = "Erased User"
            patient.phone = f"erased-{placeholder}"
            for field, value in (
                ("date_of_birth", None), ("gender", None), ("national_id", None),
                ("location", None), ("latitude", None), ("longitude", None),
                ("location_name", None), ("blood_type", None), ("height_cm", None),
                ("weight_kg", None), ("chronic_conditions", []), ("allergies", []),
                ("current_medications", []), ("special_equipment", []),
                ("insurance_info", None), ("notes", None), ("emergency_contacts", []),
                ("sms_encryption_key", None), ("consent_given_at", None),
            ):
                if hasattr(patient, field):
                    setattr(patient, field, value)
            patient.is_active = False
            patient.updated_at = datetime.utcnow()
            summary.patient_anonymized = True

    # 5. Anonymize and deactivate the user account (phone/email are unique
    #    credentials — replace with placeholders, set an unusable password)
    current_user.phone = f"erased-user-{placeholder}"
    current_user.email = None
    current_user.hashed_password = hash_password(uuid.uuid4().hex)
    current_user.is_active = False
    current_user.updated_at = datetime.utcnow()

    # 6. Revoke every outstanding token for this account
    await get_revocation_store().revoke_all_for_user(str(current_user.id))

    await db.flush()

    # 7. Audit the erasure (pseudonymous UUIDs only — no direct identifiers)
    await log_audit(
        action="erasure",
        resource="patient" if patient_id else "user",
        resource_id=str(patient_id or current_user.id),
        user_id=current_user.id,
        details=(
            "GDPR Art. 17 erasure: "
            f"{summary.medical_records_deleted} medical records deleted, "
            f"{summary.sms_logs_deleted} SMS logs deleted, "
            f"{summary.sos_requests_scrubbed} SOS requests scrubbed, "
            "patient and user records anonymized, all tokens revoked"
        ),
        request=request,
        db=db,
    )

    logger.info("GDPR erasure completed for user %s", current_user.id)
    return summary
