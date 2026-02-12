"""Celery tasks for SMS processing."""
import asyncio
import logging

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.sms_tasks.process_inbound_sms")
def process_inbound_sms(from_phone: str, body: str, twilio_sid: str = None):
    """Process an inbound SMS SOS message."""
    logger.info(f"Processing inbound SMS from {from_phone}")
    # This will:
    # 1. Look up patient by phone
    # 2. Decrypt the AES-128-GCM payload
    # 3. Create SOS record
    # 4. Alert nearest hospital
    # 5. Send confirmation SMS back
    # Actual implementation calls sms_service which needs DB session


@celery_app.task(name="tasks.sms_tasks.send_hospital_alert")
def send_hospital_alert(hospital_phone: str, patient_name: str, location: str, condition: str, patient_phone: str):
    """Send plain text SMS alert to a hospital."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.TWILIO_ACCOUNT_SID:
        logger.warning("Twilio not configured, skipping SMS")
        return

    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=f"TMT ALERT: SOS from {patient_name}\nLocation: {location}\nStatus: {condition}\nPhone: {patient_phone}",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=hospital_phone,
        )
        logger.info(f"Hospital alert SMS sent: {message.sid}")
        return message.sid
    except Exception as e:
        logger.error(f"Failed to send hospital alert SMS: {e}")
        return None


@celery_app.task(name="tasks.sms_tasks.send_patient_confirmation")
def send_patient_confirmation(patient_phone: str, hospital_name: str):
    """Send confirmation SMS to patient after SOS is received."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.TWILIO_ACCOUNT_SID:
        logger.warning("Twilio not configured, skipping SMS")
        return

    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=f"TMT: SOS received. {hospital_name} has been notified. Stay safe.",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=patient_phone,
        )
        logger.info(f"Patient confirmation SMS sent: {message.sid}")
        return message.sid
    except Exception as e:
        logger.error(f"Failed to send patient confirmation SMS: {e}")
        return None
