"""
SMS service — inbound decryption, outbound delivery via Twilio, SOS creation,
and logging.

Inbound encrypted payloads use the ``TMT:v1:<base64>`` format with AES-128-GCM
keyed per patient (derived from master key + patient_id via HKDF).  Outbound
hospital alerts and patient confirmations are sent as plain text through the
Twilio REST API.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.patient import Patient
from app.models.sms_log import SmsLog, SMSDirection
from app.models.sos_request import SosRequest, SOSSource, SOSStatus, PatientStatus
from app.models.hospital import Hospital
from app.api.middleware.encryption import decrypt_sms_payload, encrypt_sms_payload
from app.api.websocket.handler import broadcast_sos

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Twilio client (lazy initialisation)
# ---------------------------------------------------------------------------

_twilio_client = None


def _get_twilio_client():
    """Return a shared Twilio REST client, creating it on first call."""
    global _twilio_client
    if _twilio_client is None:
        try:
            from twilio.rest import Client
            settings = get_settings()
            if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
                _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            else:
                logger.warning("Twilio credentials not configured — SMS sending disabled")
        except ImportError:
            logger.warning("twilio package not installed — SMS sending disabled")
    return _twilio_client


# ---------------------------------------------------------------------------
# Inbound SMS processing
# ---------------------------------------------------------------------------

async def process_inbound_sms(
    db: AsyncSession,
    *,
    phone: str,
    sms_body: str,
    twilio_sid: str | None = None,
) -> dict[str, Any]:
    """Handle an inbound SMS message.

    Workflow:
    1. Look up the patient by phone number.
    2. Decrypt the AES-128-GCM payload using the patient-derived key.
    3. Parse the decrypted JSON for SOS fields.
    4. Create an ``SosRequest`` record.
    5. Log the SMS.
    6. Broadcast the SOS via WebSocket.

    If the phone is not associated with any patient the message is still logged
    but no SOS is created.

    Returns a dict summarising what happened.
    """
    # Step 1 — patient lookup
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    patient = result.scalar_one_or_none()

    if patient is None:
        # Log the unknown-sender SMS and bail
        await log_sms(
            db,
            direction=SMSDirection.INBOUND,
            phone=phone,
            patient_id=None,
            message_body="[unknown sender]",
            decrypted=False,
            delivery_status="received",
            twilio_sid=twilio_sid,
        )
        logger.warning("Inbound SMS from unknown phone %s", phone)
        return {"status": "unknown_sender", "phone": phone}

    # Step 2 — decrypt
    decrypted = False
    plaintext: str | None = None
    try:
        plaintext = decrypt_sms_payload(sms_body, str(patient.id))
        decrypted = True
    except Exception as exc:
        logger.error("Failed to decrypt SMS from patient %s: %s", patient.id, exc)
        # Fall through — we still log the message

    # Step 3 — parse SOS payload
    sos_data: dict[str, Any] = {}
    if plaintext:
        try:
            sos_data = json.loads(plaintext)
        except json.JSONDecodeError:
            # Treat the whole plaintext as free-text details
            sos_data = {"details": plaintext}

    # Step 4 — create SOS request
    patient_status_raw = sos_data.get("patient_status", "injured")
    try:
        patient_status = PatientStatus(patient_status_raw)
    except ValueError:
        patient_status = PatientStatus.INJURED

    severity = sos_data.get("severity", 3)
    if not isinstance(severity, int) or severity < 1 or severity > 5:
        severity = 3

    latitude = sos_data.get("latitude", patient.latitude)
    longitude = sos_data.get("longitude", patient.longitude)

    # Sync patient's stored location with the freshest data from SMS
    if latitude is not None and longitude is not None:
        try:
            from app.services import patient_service
            await patient_service.update_patient_location(db, patient.id, latitude, longitude)
        except Exception:
            logger.warning("Failed to sync SMS location for patient %s", patient.id)

    # Detect if SOS originates from within a hospital (e.g. hospital under attack)
    origin_hospital_id = None
    if latitude is not None and longitude is not None:
        try:
            from app.services import hospital_service
            from app.services.sos_resolution_service import HOSPITAL_ARRIVAL_RADIUS_M
            nearby = await hospital_service.find_nearest_hospitals(
                db, latitude, longitude,
                radius_m=HOSPITAL_ARRIVAL_RADIUS_M,
                limit=1,
                operational_only=False,
            )
            if nearby:
                origin_hospital_id = nearby[0]["id"]
        except Exception:
            logger.warning("Failed to detect origin hospital for SMS SOS from patient %s", patient.id)

    sos = SosRequest(
        id=uuid.uuid4(),
        patient_id=patient.id,
        latitude=latitude,
        longitude=longitude,
        location=(
            func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)
            if latitude is not None and longitude is not None
            else None
        ),
        status=SOSStatus.PENDING,
        patient_status=patient_status,
        severity=severity,
        source=SOSSource.SMS,
        details=sos_data.get("details"),
        origin_hospital_id=origin_hospital_id,
    )
    db.add(sos)
    await db.flush()

    # Step 5 — log SMS
    await log_sms(
        db,
        direction=SMSDirection.INBOUND,
        phone=phone,
        patient_id=patient.id,
        message_body="[encrypted]" if decrypted else sms_body[:200],
        decrypted=decrypted,
        delivery_status="received",
        twilio_sid=twilio_sid,
    )

    # Step 6 — broadcast
    sos_payload = {
        "id": str(sos.id),
        "patient_id": str(patient.id),
        "patient_name": patient.name,
        "latitude": latitude,
        "longitude": longitude,
        "patient_status": patient_status.value,
        "severity": severity,
        "source": "sms",
        "details": sos_data.get("details"),
        "created_at": sos.created_at.isoformat() if sos.created_at else datetime.utcnow().isoformat(),
    }
    try:
        await broadcast_sos(sos_payload)
    except Exception:
        logger.exception("Failed to broadcast SOS %s", sos.id)

    logger.info("Processed inbound SMS SOS from patient %s (sos=%s)", patient.id, sos.id)
    return {
        "status": "sos_created",
        "sos_id": str(sos.id),
        "patient_id": str(patient.id),
        "decrypted": decrypted,
        "severity": severity,
        "patient_status": patient_status.value,
    }


# ---------------------------------------------------------------------------
# Outbound SMS
# ---------------------------------------------------------------------------

async def send_hospital_alert_sms(
    db: AsyncSession,
    *,
    hospital_id: uuid.UUID,
    message: str,
) -> dict[str, Any]:
    """Send a plain-text alert SMS to a hospital's phone number.

    Returns delivery metadata including the Twilio SID when successful.
    """
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        raise ValueError(f"Hospital {hospital_id} not found")
    if not hospital.phone:
        raise ValueError(f"Hospital {hospital_id} has no phone number configured")

    settings = get_settings()
    twilio_sid: str | None = None
    delivery_status = "pending"

    client = _get_twilio_client()
    if client is not None:
        try:
            tw_message = client.messages.create(
                body=message,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=hospital.phone,
            )
            twilio_sid = tw_message.sid
            delivery_status = "sent"
            logger.info("Sent alert SMS to hospital %s (sid=%s)", hospital_id, twilio_sid)
        except Exception as exc:
            delivery_status = "failed"
            logger.error("Failed to send SMS to hospital %s: %s", hospital_id, exc)
    else:
        delivery_status = "skipped"
        logger.warning("Twilio client not available — SMS to hospital %s skipped", hospital_id)

    await log_sms(
        db,
        direction=SMSDirection.OUTBOUND,
        phone=hospital.phone,
        patient_id=None,
        message_body=message[:200],
        decrypted=False,
        delivery_status=delivery_status,
        twilio_sid=twilio_sid,
    )

    return {
        "hospital_id": str(hospital_id),
        "phone": hospital.phone,
        "delivery_status": delivery_status,
        "twilio_sid": twilio_sid,
    }


async def send_patient_confirmation_sms(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    message: str,
    encrypt: bool = False,
) -> dict[str, Any]:
    """Send an SMS to a patient.

    When *encrypt* is ``True`` the *message* is encrypted with the patient's
    derived AES-128-GCM key before sending (produces a ``TMT:v1:`` payload).
    Otherwise the message is sent as plain text (e.g. status confirmations).
    """
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise ValueError(f"Patient {patient_id} not found")
    if not patient.phone:
        raise ValueError(f"Patient {patient_id} has no phone number")

    body = message
    if encrypt:
        try:
            body = encrypt_sms_payload(message, str(patient.id))
        except Exception as exc:
            logger.error("Encryption failed for patient %s: %s", patient_id, exc)
            raise

    settings = get_settings()
    twilio_sid: str | None = None
    delivery_status = "pending"

    client = _get_twilio_client()
    if client is not None:
        try:
            tw_message = client.messages.create(
                body=body,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=patient.phone,
            )
            twilio_sid = tw_message.sid
            delivery_status = "sent"
            logger.info("Sent confirmation SMS to patient %s (sid=%s)", patient_id, twilio_sid)
        except Exception as exc:
            delivery_status = "failed"
            logger.error("Failed to send SMS to patient %s: %s", patient_id, exc)
    else:
        delivery_status = "skipped"
        logger.warning("Twilio client not available — SMS to patient %s skipped", patient_id)

    await log_sms(
        db,
        direction=SMSDirection.OUTBOUND,
        phone=patient.phone,
        patient_id=patient.id,
        message_body="[encrypted]" if encrypt else message[:200],
        decrypted=False,
        delivery_status=delivery_status,
        twilio_sid=twilio_sid,
    )

    return {
        "patient_id": str(patient_id),
        "phone": patient.phone,
        "delivery_status": delivery_status,
        "twilio_sid": twilio_sid,
        "encrypted": encrypt,
    }


# ---------------------------------------------------------------------------
# SMS logging
# ---------------------------------------------------------------------------

async def log_sms(
    db: AsyncSession,
    *,
    direction: SMSDirection,
    phone: str,
    patient_id: uuid.UUID | None = None,
    message_body: str | None = None,
    decrypted: bool = False,
    delivery_status: str = "pending",
    twilio_sid: str | None = None,
) -> SmsLog:
    """Persist an SMS log entry.

    Returns the created ``SmsLog`` instance (already flushed).
    """
    entry = SmsLog(
        id=uuid.uuid4(),
        direction=direction,
        phone=phone,
        patient_id=patient_id,
        message_body=message_body,
        decrypted=decrypted,
        delivery_status=delivery_status,
        twilio_sid=twilio_sid,
    )
    db.add(entry)
    await db.flush()
    return entry


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def get_sms_logs(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID | None = None,
    direction: str | SMSDirection | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Retrieve SMS logs with optional filters."""
    query = select(SmsLog).order_by(SmsLog.created_at.desc()).limit(limit).offset(offset)

    if patient_id is not None:
        query = query.where(SmsLog.patient_id == patient_id)
    if direction is not None:
        if isinstance(direction, str):
            direction = SMSDirection(direction)
        query = query.where(SmsLog.direction == direction)

    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "direction": e.direction.value if e.direction else None,
            "phone": e.phone,
            "patient_id": str(e.patient_id) if e.patient_id else None,
            "message_body": e.message_body,
            "decrypted": e.decrypted,
            "delivery_status": e.delivery_status,
            "twilio_sid": e.twilio_sid,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]
