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
from app.models.sms_log import SMSDirection
from app.api.middleware.audit import log_audit
from app.services import sms_service

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

    # Delegate to sms_service — handles patient lookup, decryption,
    # compact payload parsing, dedup, SOS creation, logging, and broadcast
    result = await sms_service.process_inbound_sms(
        db,
        phone=phone,
        sms_body=Body,
        twilio_sid=MessageSid or None,
    )

    await db.flush()

    sos_id = result.get("sos_id")
    is_encrypted = Body.startswith("TMT:v1:")

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=sos_id,
        details=f"SMS SOS from {phone} (encrypted={is_encrypted}, status={result.get('status')})",
        request=request,
        db=db,
    )

    if result.get("status") == "sos_created":
        return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>SOS received. Help is on the way.</Message></Response>'
    elif result.get("status") == "duplicate":
        return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>SOS already received.</Message></Response>'
    else:
        return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


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

    # Process the SOS via the service (handles decryption, dedup, etc.)
    result = await sms_service.process_inbound_sms(
        db,
        phone=phone,
        sms_body=payload.body,
    )

    await log_audit(
        action="create",
        resource="sos_request",
        resource_id=result.get("sos_id"),
        details=f"Test SMS SOS from {phone}",
        request=request,
        db=db,
    )

    return SMSTestResponse(
        status="success" if result.get("status") == "sos_created" else result.get("status", "error"),
        message=f"SOS {result.get('status', 'processed')}",
        patient_found=True,
        patient_id=str(patient.id),
        decrypted=result.get("decrypted", False),
    )
