"""
SMS API routes.

Endpoints:
    POST /sms/inbound — Twilio webhook for inbound SMS SOS (no auth, Twilio signature verification)
    POST /sms/test    — Test SMS endpoint (dev only)
"""

import hashlib
import hmac
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.postgres import get_db
from app.models.patient import Patient
from app.models.sms_log import SmsLog, SMSDirection
from app.models.sos_request import SOSSource
from app.api.middleware.audit import log_audit
from app.api.middleware.encryption import decrypt_sms_payload
from app.services import sms_service, patient_service
from app.api.websocket.handler import broadcast_sos

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SMSTestRequest(BaseModel):
    phone: str
    body: str


class SMSTestResponse(BaseModel):
    status: str
    message: str
    patient_found: bool = False
    patient_id: Optional[str] = None
    decrypted: bool = False


class SMSLogResponse(BaseModel):
    id: UUID
    direction: SMSDirection
    phone: str
    patient_id: Optional[UUID] = None
    decrypted: bool
    delivery_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Twilio signature verification
# ---------------------------------------------------------------------------

def _verify_twilio_signature(request: Request, body_params: dict) -> bool:
    """
    Verify the X-Twilio-Signature header to ensure the request is from Twilio.
    Returns True if the signature is valid or if Twilio auth token is not configured
    (dev mode).
    """
    if not settings.TWILIO_AUTH_TOKEN:
        # Dev mode — skip verification when no auth token configured
        return True

    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        return False

    # Build the full URL Twilio signed
    url = str(request.url)

    # Sort POST params and concatenate
    sorted_params = sorted(body_params.items())
    data_string = url + "".join(f"{k}{v}" for k, v in sorted_params)

    # HMAC-SHA1
    computed = hmac.new(
        settings.TWILIO_AUTH_TOKEN.encode("utf-8"),
        data_string.encode("utf-8"),
        hashlib.sha1,
    ).digest()

    import base64
    expected_signature = base64.b64encode(computed).decode("utf-8")
    return hmac.compare_digest(signature, expected_signature)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/sms/inbound", response_class=PlainTextResponse)
async def sms_inbound_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    From: str = Form(...),
    Body: str = Form(default=""),
    MessageSid: str = Form(default=""),
    To: str = Form(default=""),
):
    """
    Twilio webhook for inbound SMS.
    Processes SOS messages sent via SMS when internet is unavailable.
    No JWT auth — verified via Twilio signature.
    """
    body_params = {
        "From": From,
        "Body": Body,
        "MessageSid": MessageSid,
        "To": To,
    }

    # Verify Twilio signature
    if not _verify_twilio_signature(request, body_params):
        logger.warning("Invalid Twilio signature from %s", From)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Twilio signature",
        )

    # Normalize phone number
    phone = From.strip()

    # Log the inbound SMS
    sms_log = SmsLog(
        direction=SMSDirection.INBOUND,
        phone=phone,
        message_body=None,  # Never store raw body for privacy
        twilio_sid=MessageSid or None,
    )
    db.add(sms_log)

    # Look up patient by phone
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    patient = result.scalar_one_or_none()

    if patient is None:
        logger.info("SMS from unknown phone: %s", phone)
        sms_log.delivery_status = "no_patient"
        await db.flush()
        # Respond with TwiML (empty response to avoid Twilio errors)
        return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

    sms_log.patient_id = patient.id

    # Attempt to decrypt if it's an encrypted SOS payload
    decrypted_body = None
    is_encrypted = Body.startswith("TMT:v1:")

    if is_encrypted:
        try:
            decrypted_body = decrypt_sms_payload(Body, str(patient.id))
            sms_log.decrypted = True
            sms_log.delivery_status = "decrypted"
        except Exception as e:
            logger.error("Failed to decrypt SMS from %s: %s", phone, str(e))
            sms_log.delivery_status = "decrypt_failed"
            await db.flush()
            return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    else:
        # Plain text SOS — treat the body as details
        decrypted_body = Body
        sms_log.delivery_status = "plaintext"

    # Process the SOS via the SMS service
    sos = await sms_service.process_inbound_sms(
        db,
        patient=patient,
        message_body=decrypted_body or "",
        source=SOSSource.SMS,
    )

    await db.flush()

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=str(sos.id) if sos else None,
        details=f"SMS SOS from {phone} (encrypted={is_encrypted})",
        request=request,
        db=db,
    )

    # Broadcast SOS to dashboards
    if sos:
        await broadcast_sos({
            "id": str(sos.id),
            "patient_id": str(sos.patient_id),
            "latitude": sos.latitude,
            "longitude": sos.longitude,
            "status": sos.status.value,
            "patient_status": sos.patient_status.value if sos.patient_status else None,
            "severity": sos.severity,
            "source": sos.source.value,
            "details": sos.details,
            "created_at": sos.created_at.isoformat() if sos.created_at else None,
        })

    # Respond with TwiML
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>SOS received. Help is on the way.</Message></Response>'


@router.post("/sms/test", response_model=SMSTestResponse)
async def test_sms_endpoint(
    payload: SMSTestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Test SMS processing endpoint for development.
    Simulates an inbound SMS without Twilio.
    Only available in debug mode.
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Test endpoint is only available in debug mode",
        )

    phone = payload.phone.strip()

    # Look up patient
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    patient = result.scalar_one_or_none()

    if patient is None:
        return SMSTestResponse(
            status="warning",
            message="No patient found for this phone number",
            patient_found=False,
        )

    # Try decryption
    decrypted = False
    body = payload.body
    if body.startswith("TMT:v1:"):
        try:
            body = decrypt_sms_payload(body, str(patient.id))
            decrypted = True
        except Exception as e:
            return SMSTestResponse(
                status="error",
                message=f"Decryption failed: {str(e)}",
                patient_found=True,
                patient_id=str(patient.id),
            )

    # Process the SOS
    sos = await sms_service.process_inbound_sms(
        db,
        patient=patient,
        message_body=body,
        source=SOSSource.SMS,
    )

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=str(sos.id) if sos else None,
        details=f"Test SMS SOS from {phone}",
        request=request,
        db=db,
    )

    return SMSTestResponse(
        status="success",
        message="SOS processed successfully",
        patient_found=True,
        patient_id=str(patient.id),
        decrypted=decrypted,
    )
