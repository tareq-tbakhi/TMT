"""Celery tasks for SOS → AI triage → Alert creation pipeline."""
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


# Map patient_status to likely event types
_STATUS_EVENT_MAP = {
    "injured": "medical_emergency",
    "trapped": "building_collapse",
    "evacuate": "other",
    "safe": "other",
}

# Map SOS severity (1-5) to alert severity strings
_SEVERITY_MAP = {
    1: "low",
    2: "medium",
    3: "medium",
    4: "high",
    5: "critical",
}


async def _gather_context(db, patient_id: str | None, lat: float | None, lon: float | None):
    """Gather patient history, nearby alerts, and Telegram intel for priority scoring."""
    from sqlalchemy import select
    from app.models.patient import Patient
    from app.models.medical_record import MedicalRecord
    from app.services.alert_service import get_alerts_near
    from app.services.livemap_service import get_events_in_area

    patient_info = None
    medical_records = []
    nearby_alerts = []
    nearby_telegram = []

    # 1. Patient info + medical records
    if patient_id:
        try:
            from uuid import UUID
            pid = UUID(patient_id)
            result = await db.execute(select(Patient).where(Patient.id == pid))
            patient = result.scalar_one_or_none()
            if patient:
                patient_info = {
                    "name": patient.name,
                    "mobility": patient.mobility.value if patient.mobility else None,
                    "living_situation": patient.living_situation.value if patient.living_situation else None,
                    "blood_type": patient.blood_type,
                    "trust_score": patient.trust_score if patient.trust_score is not None else 1.0,
                    "false_alarm_count": patient.false_alarm_count or 0,
                    "total_sos_count": patient.total_sos_count or 0,
                }
                # Get medical records
                recs = await db.execute(
                    select(MedicalRecord).where(MedicalRecord.patient_id == pid)
                )
                for rec in recs.scalars().all():
                    medical_records.append({
                        "conditions": rec.conditions or [],
                        "medications": rec.medications or [],
                        "allergies": rec.allergies or [],
                        "special_equipment": rec.special_equipment or [],
                        "notes": rec.notes,
                    })
        except Exception as e:
            logger.debug("Could not fetch patient context: %s", e)

    # 2. Nearby active alerts (within 5km) — density indicator
    if lat is not None and lon is not None:
        try:
            nearby_alerts = await get_alerts_near(
                db, latitude=lat, longitude=lon, radius_m=5000, limit=50
            )
        except Exception as e:
            logger.debug("Could not fetch nearby alerts: %s", e)

        # 3. Nearby Telegram-sourced events (within 5km)
        try:
            all_nearby_events = await get_events_in_area(
                db, latitude=lat, longitude=lon, radius_m=5000, hours=24, limit=50
            )
            nearby_telegram = [
                e for e in all_nearby_events
                if e.get("source") in ("telegram", "telegram_intel")
            ]
        except Exception as e:
            logger.debug("Could not fetch nearby geo events: %s", e)

    return patient_info, medical_records, nearby_alerts, nearby_telegram


@celery_app.task(name="tasks.sos_tasks.triage_sos_request")
def triage_sos_request(sos_data: dict):
    """
    AI-powered SOS triage pipeline:
    1. Gathers patient medical history, nearby alerts, and Telegram intel
    2. Calls GLM-5 to classify the SOS and determine event type + severity
    3. Runs priority assessment with full context
    4. Creates an Alert record with priority_score in metadata
    5. Alert is automatically broadcast to dashboards and live map
    """
    logger.info(
        "Triaging SOS %s (severity=%s, status=%s)",
        sos_data.get("id"),
        sos_data.get("severity"),
        sos_data.get("patient_status"),
    )

    async def _run():
        from app.services.ai_agent.agent import _call_glm, assess_priority
        from app.services.alert_service import create_alert
        from app.db.postgres import async_session
        from app.config import get_settings
        import json

        settings = get_settings()

        # Build context for AI classification
        patient_status = sos_data.get("patient_status", "injured")
        severity_num = sos_data.get("severity", 3)
        details = sos_data.get("details", "")
        lat = sos_data.get("latitude")
        lon = sos_data.get("longitude")
        patient_id = sos_data.get("patient_id")

        async with async_session() as db:
            # --- Step 0: Gather context ---
            patient_info, medical_records, nearby_alerts, nearby_telegram = \
                await _gather_context(db, patient_id, lat, lon)

            context_summary = ""
            if patient_info:
                context_summary += f"\nPatient: mobility={patient_info.get('mobility')}, living={patient_info.get('living_situation')}"
            if medical_records:
                all_conditions = []
                all_equipment = []
                for rec in medical_records:
                    all_conditions.extend(rec.get("conditions", []))
                    all_equipment.extend(rec.get("special_equipment", []))
                if all_conditions:
                    context_summary += f"\nMedical conditions: {', '.join(set(all_conditions))}"
                if all_equipment:
                    context_summary += f"\nRequired equipment: {', '.join(set(all_equipment))}"
            if nearby_alerts:
                context_summary += f"\nActive alerts within 5km: {len(nearby_alerts)}"
            if nearby_telegram:
                context_summary += f"\nTelegram-confirmed events nearby: {len(nearby_telegram)}"

            # --- Step 1: AI Classification ---
            ai_result = None
            if settings.GLM_API_KEY:
                try:
                    system_prompt = """You are an emergency triage AI for a crisis response system in Palestine/Gaza.
A patient has sent an SOS request. Based on ALL the information provided (including patient medical history,
nearby crisis reports, and intelligence data), classify this emergency.

Respond ONLY with valid JSON:
{
  "event_type": "flood|bombing|earthquake|fire|building_collapse|shooting|chemical|medical_emergency|infrastructure|other",
  "severity": "low|medium|high|critical",
  "title": "Brief descriptive title for this alert (max 80 chars)",
  "details": "Summary of the situation for hospital responders, mentioning patient vulnerabilities if relevant",
  "urgency": "low|medium|high|immediate",
  "confidence": 0.0-1.0
}"""

                    user_message = f"""SOS Request:
- Patient Status: {patient_status}
- Severity Level: {severity_num}/5
- Details: {details or 'No details provided'}
- Location: {'%.4f, %.4f' % (lat, lon) if lat and lon else 'Unknown'}
- Source: {sos_data.get('source', 'api')}
{context_summary}"""

                    raw = await _call_glm(system_prompt, user_message, max_tokens=4096)
                    ai_result = json.loads(raw)
                    logger.info("AI triage result: %s", ai_result)
                except Exception as e:
                    logger.warning("AI triage failed, using fallback: %s", e)

            # --- Step 2: Determine event type and severity ---
            if ai_result:
                event_type = ai_result.get("event_type", _STATUS_EVENT_MAP.get(patient_status, "other"))
                severity_str = ai_result.get("severity", _SEVERITY_MAP.get(severity_num, "medium"))
                title = ai_result.get("title", f"SOS Alert — Patient {patient_status}")
                alert_details = ai_result.get("details", details or f"Patient reports status: {patient_status}")
                confidence = ai_result.get("confidence", 0.5)
            else:
                # Fallback: rule-based classification
                event_type = _STATUS_EVENT_MAP.get(patient_status, "other")
                severity_str = _SEVERITY_MAP.get(severity_num, "medium")
                title = f"SOS Alert — Patient {patient_status}"
                alert_details = details or f"Patient reports status: {patient_status}"
                confidence = 0.4

            # Bump severity for trapped/critical cases
            if patient_status == "trapped" and severity_str not in ("high", "critical"):
                severity_str = "high"
            if severity_num >= 5:
                severity_str = "critical"

            # --- Step 3: Priority Assessment ---
            priority = await assess_priority(
                sos_data,
                patient_info=patient_info,
                medical_records=medical_records,
                nearby_alerts=nearby_alerts,
                nearby_telegram_events=nearby_telegram,
            )
            logger.info(
                "Priority assessment for SOS %s: score=%s, urgency=%s",
                sos_data.get("id"),
                priority.get("priority_score"),
                priority.get("estimated_response_urgency"),
            )

            # Bump severity based on priority score
            if priority.get("priority_score", 0) >= 80 and severity_str not in ("critical",):
                severity_str = "critical"
            elif priority.get("priority_score", 0) >= 60 and severity_str not in ("high", "critical"):
                severity_str = "high"

            # --- Step 4: Create Alert ---
            if lat is None or lon is None:
                lat = lat or 31.5017
                lon = lon or 34.4668

            try:
                alert = await create_alert(
                    db,
                    event_type=event_type,
                    latitude=lat,
                    longitude=lon,
                    title=title,
                    radius_m=500,
                    details=alert_details,
                    source="sos",
                    confidence=confidence,
                    severity_override=severity_str,
                    metadata={
                        "sos_id": sos_data.get("id"),
                        "patient_id": patient_id,
                        "patient_status": patient_status,
                        "sos_severity": severity_num,
                        "ai_classified": ai_result is not None,
                        "priority_score": priority.get("priority_score", 50),
                        "priority_factors": priority.get("priority_factors", []),
                        "response_urgency": priority.get("estimated_response_urgency", "when_available"),
                        "recommendation": priority.get("recommendation", ""),
                        "nearby_alert_count": len(nearby_alerts),
                        "telegram_corroborated": len(nearby_telegram) > 0,
                        "patient_vulnerable": bool(
                            patient_info and (
                                patient_info.get("mobility") in ("bedridden", "wheelchair")
                                or patient_info.get("living_situation") == "alone"
                            )
                        ),
                        "patient_trust_score": patient_info.get("trust_score", 1.0) if patient_info else 1.0,
                        "patient_false_alarms": patient_info.get("false_alarm_count", 0) if patient_info else 0,
                        "patient_info": sos_data.get("patient_info"),
                    },
                    broadcast=True,
                    notify_patients=True,
                )
                await db.commit()
                logger.info(
                    "Alert created from SOS %s → Alert %s [%s/%s] priority=%s",
                    sos_data.get("id"),
                    alert.get("id"),
                    event_type,
                    severity_str,
                    priority.get("priority_score"),
                )
                return alert
            except Exception as e:
                await db.rollback()
                logger.exception("Failed to create alert from SOS %s: %s", sos_data.get("id"), e)
                return None

    return _run_async(_run())
