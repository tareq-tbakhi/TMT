"""Celery tasks for SOS → CrewAI triage → Alert creation pipeline.

Uses a 2-agent CrewAI crew:
  1. Risk Scorer Agent — assesses patient risk, recommends hospital
  2. Triage Agent — classifies event, creates alert with full context

Falls back to the original rule-based pipeline when CrewAI is unavailable.
"""
import asyncio
import json
import logging
import re

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# Map patient_status to likely event types (fallback)
_STATUS_EVENT_MAP = {
    "injured": "medical_emergency",
    "trapped": "building_collapse",
    "evacuate": "other",
    "safe": "other",
}

# Map SOS severity (1-5) to alert severity strings (fallback)
_SEVERITY_MAP = {
    1: "low",
    2: "medium",
    3: "medium",
    4: "high",
    5: "critical",
}

# Event type → default department routing (fallback)
_EVENT_DEPARTMENT_MAP = {
    "medical_emergency": "hospital",
    "bombing": "civil_defense",
    "shooting": "police",
    "fire": "civil_defense",
    "building_collapse": "civil_defense",
    "flood": "civil_defense",
    "earthquake": "civil_defense",
    "chemical": "civil_defense",
    "infrastructure": "civil_defense",
    "other": "hospital",
}


# ── Keyword-based department classification (fallback) ──────────────────

_POLICE_KEYWORDS = [
    "shoot", "shot", "gun", "armed", "sniper", "kidnap", "carjack",
    "robb", "loot", "hostage", "stab", "knife", "kniv",
    "weapon", "threaten", "murder", "assault", "violence",
    "stole", "stolen", "theft", "crime",
]

_CIVIL_DEFENSE_KEYWORDS = [
    "fire", "flame", "burning", "smoke", "collaps", "rubble",
    "flood", "water rising", "earthquake", "gas leak", "hazmat",
    "sinkhole", "landslide", "explo", "power line", "live wire",
    "sparking", "fumes", "spill", "evacuat", "overturned",
    "rescue team", "unexploded", "ordnance", "uxo", "airstrike",
    "mortar", "debris", "bomb", "shell", "trapped",
]


def _keyword_score(msg: str, keywords: list[str]) -> int:
    """Count how many keywords match in the message (word-boundary aware)."""
    return sum(1 for kw in keywords if re.search(r"\b" + re.escape(kw), msg, re.IGNORECASE))


def _classify_department_from_message(message: str, patient_status: str) -> str:
    """Classify department from SOS message content using keyword matching.

    Priority order:
      1. Specific phrase checks (bomb threat → police)
      2. Keyword scoring: police vs civil_defense
      3. Patient status fallback
      4. Default → hospital
    """
    if not message:
        if patient_status in ("trapped", "evacuate"):
            return "civil_defense"
        return "hospital"

    msg = message.lower()

    # Phase 1: specific phrase overrides
    if "bomb threat" in msg or "suspicious package" in msg:
        return "police"

    # Phase 2: keyword scoring
    police_score = _keyword_score(msg, _POLICE_KEYWORDS)
    civil_score = _keyword_score(msg, _CIVIL_DEFENSE_KEYWORDS)

    if police_score > civil_score:
        return "police"
    if civil_score > police_score:
        return "civil_defense"
    if police_score > 0:  # tie → security threat takes priority
        return "police"

    # Phase 3: status-based fallback
    if patient_status in ("trapped", "evacuate"):
        return "civil_defense"

    # Phase 4: default
    return "hospital"


@celery_app.task(name="tasks.sos_tasks.triage_sos_request", bind=True, max_retries=2,
                 time_limit=300, soft_time_limit=270)
def triage_sos_request(self, sos_data: dict):
    """
    AI-powered SOS triage using CrewAI multi-agent crew.

    Crew flow:
    1. Risk Scorer Agent — queries patient profile, medical records, SOS history,
       nearby threats, and hospitals → computes risk score + hospital recommendation
    2. Triage Agent — classifies event type/severity, checks Telegram intel,
       creates the alert with all context

    Falls back to rule-based triage if CrewAI fails.
    """
    logger.info(
        "Triaging SOS %s (severity=%s, status=%s)",
        sos_data.get("id"),
        sos_data.get("severity"),
        sos_data.get("patient_status"),
    )

    # --- Try CrewAI first ---
    try:
        from app.services.ai_agent.crews import build_triage_crew
        from app.config import get_settings

        settings = get_settings()
        if not settings.GLM_API_KEY:
            raise RuntimeError("No LLM API key — skipping CrewAI")

        crew = build_triage_crew()
        result = crew.kickoff(inputs={
            "patient_id": str(sos_data.get("patient_id", "")),
            "latitude": sos_data.get("latitude", 31.5017),
            "longitude": sos_data.get("longitude", 34.4668),
            "severity": sos_data.get("severity", 3),
            "message": sos_data.get("message") or sos_data.get("details") or "",
            "patient_status": sos_data.get("patient_status", "unknown"),
            "sos_id": str(sos_data.get("id", "")),
            "patient_info": json.dumps(sos_data.get("patient_info", {}), default=str),
        })

        logger.info("CrewAI triage completed for SOS %s: %s", sos_data.get("id"), str(result.raw)[:200])

        # Extract routed_department from CrewAI result and update SOS record
        _update_sos_routing(sos_data.get("id"), result.raw)

        return result.raw

    except Exception as e:
        logger.warning("CrewAI triage failed for SOS %s, falling back to rule-based: %s", sos_data.get("id"), e)

    # --- Fallback: original rule-based pipeline ---
    return _fallback_triage(sos_data)


def _update_sos_routing(sos_id, crew_result_raw):
    """Extract routed_department from CrewAI result and update SOS record."""
    if not sos_id:
        return

    try:
        parsed = json.loads(crew_result_raw) if isinstance(crew_result_raw, str) else crew_result_raw
    except (json.JSONDecodeError, TypeError):
        parsed = {}

    dept = None
    if isinstance(parsed, dict):
        dept = parsed.get("routed_department")
    if not dept and isinstance(crew_result_raw, str):
        for d in ("hospital", "police", "civil_defense"):
            if f'"routed_department": "{d}"' in crew_result_raw or f'"routed_department":"{d}"' in crew_result_raw:
                dept = d
                break

    if dept and dept in ("hospital", "police", "civil_defense"):
        async def _update():
            from sqlalchemy import select
            from app.models.sos_request import SosRequest
            from app.db.postgres import async_session
            from uuid import UUID

            async with async_session() as db:
                result = await db.execute(select(SosRequest).where(SosRequest.id == UUID(str(sos_id))))
                sos = result.scalar_one_or_none()
                if sos:
                    sos.routed_department = dept
                    await db.commit()
                    logger.info("SOS %s routed to department: %s", sos_id, dept)

        try:
            _run_async(_update())
        except Exception as e:
            logger.warning("Could not update SOS routing: %s", e)


def _fallback_triage(sos_data: dict):
    """Original rule-based triage pipeline — used when CrewAI is unavailable."""

    async def _run():
        from app.services.ai_agent.agent import assess_priority
        from app.services.alert_service import create_alert
        from app.db.postgres import async_session

        patient_status = sos_data.get("patient_status", "injured")
        severity_num = sos_data.get("severity", 3)
        details = sos_data.get("details", "")
        lat = sos_data.get("latitude")
        lon = sos_data.get("longitude")
        patient_id = sos_data.get("patient_id")

        async with async_session() as db:
            patient_info, medical_records, nearby_alerts, nearby_telegram = \
                await _gather_context(db, patient_id, lat, lon)

            event_type = _STATUS_EVENT_MAP.get(patient_status, "other")
            severity_str = _SEVERITY_MAP.get(severity_num, "medium")
            title = f"SOS Alert — Patient {patient_status}"
            message = sos_data.get("message") or details or ""
            alert_details = message or f"Patient reports status: {patient_status}"
            confidence = 0.4

            if patient_status == "trapped" and severity_str not in ("high", "critical"):
                severity_str = "high"
            if severity_num >= 5:
                severity_str = "critical"

            # Try LLM-based priority assessment (non-fatal if it fails)
            priority = {}
            try:
                priority = await assess_priority(
                    sos_data,
                    patient_info=patient_info,
                    medical_records=medical_records,
                    nearby_alerts=nearby_alerts,
                    nearby_telegram_events=nearby_telegram,
                )
            except Exception as e:
                logger.warning("assess_priority failed, using defaults: %s", e)
                priority = {"priority_score": 50}

            if priority.get("priority_score", 0) >= 80 and severity_str != "critical":
                severity_str = "critical"
            elif priority.get("priority_score", 0) >= 60 and severity_str not in ("high", "critical"):
                severity_str = "high"

            if lat is None or lon is None:
                lat = lat or 31.5017
                lon = lon or 34.4668

            # Message-content-aware department routing
            routed_department = _classify_department_from_message(message, patient_status)

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
                    routed_department=routed_department,
                    metadata={
                        "sos_id": sos_data.get("id"),
                        "patient_id": patient_id,
                        "patient_status": patient_status,
                        "sos_severity": severity_num,
                        "ai_classified": False,
                        "routed_department": routed_department,
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
                logger.info("Fallback alert created from SOS %s → Alert %s (dept=%s)",
                            sos_data.get("id"), alert.get("id"), routed_department)

                # Update SOS record with routing
                _update_sos_routing(sos_data.get("id"), json.dumps({"routed_department": routed_department}))

                return alert
            except Exception as e:
                await db.rollback()
                logger.exception("Failed to create alert from SOS %s: %s", sos_data.get("id"), e)
                return None

    return _run_async(_run())


async def _gather_context(db, patient_id, lat, lon):
    """Gather patient history, nearby alerts, and Telegram intel."""
    from sqlalchemy import select
    from app.models.patient import Patient
    from app.models.medical_record import MedicalRecord
    from app.services.alert_service import get_alerts_near
    from app.services.livemap_service import get_events_in_area

    patient_info = None
    medical_records = []
    nearby_alerts = []
    nearby_telegram = []

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

    if lat is not None and lon is not None:
        try:
            nearby_alerts = await get_alerts_near(
                db, latitude=lat, longitude=lon, radius_m=5000, limit=50
            )
        except Exception as e:
            logger.debug("Could not fetch nearby alerts: %s", e)

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
