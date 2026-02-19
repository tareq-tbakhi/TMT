"""
AI Agent — Core decision-making engine using GLM-5 API (Zhipu AI).
Classifies messages, extracts crisis info, detects knowledge gaps,
decides which Telegram channels to join.
"""
import json
import logging
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions"
GLM_MODEL = "glm-5"


def _extract_json(text: str) -> str:
    """Strip markdown code fences from LLM responses to get raw JSON."""
    import re
    # Try to extract JSON from ```json ... ``` blocks
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Try to find raw JSON object/array
    for start_ch, end_ch in [("{", "}"), ("[", "]")]:
        start = text.find(start_ch)
        end = text.rfind(end_ch)
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]
    return text.strip()


async def _call_glm(system_prompt: str, user_message: str, max_tokens: int = 4096) -> str:
    """Make a call to GLM-5 API (OpenAI-compatible)."""
    if not settings.GLM_API_KEY:
        logger.warning("GLM API key not configured, using fallback")
        return "{}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            GLM_API_URL,
            headers={
                "Authorization": f"Bearer {settings.GLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GLM_MODEL,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            },
        )
        response.raise_for_status()
        data = response.json()
        if "choices" in data and data["choices"]:
            msg = data["choices"][0].get("message", {})
            raw = msg.get("content", "")
            # GLM-5 is a reasoning model: if content is empty, check reasoning_content
            if not raw and msg.get("reasoning_content"):
                logger.info("GLM content empty, extracting from reasoning_content")
                raw = msg["reasoning_content"]
        else:
            raw = ""
        return _extract_json(raw)


async def classify_message(text: str) -> dict:
    """
    Classify a Telegram message as crisis-related or not.
    Returns: {"is_crisis": bool, "confidence": float, "category": str}
    """
    system = """You are a crisis detection classifier for an emergency response system in Palestine.
Analyze the message and determine if it describes an active crisis event (bombing, flood, earthquake,
shooting, building collapse, fire, chemical hazard, medical emergency, infrastructure damage).

Respond ONLY with valid JSON:
{"is_crisis": true/false, "confidence": 0.0-1.0, "category": "crisis_type_or_none"}"""

    # Strong crisis keywords — if these appear and the AI says "not a crisis",
    # the keyword match overrides the AI to prevent dangerous false negatives.
    crisis_keywords = [
        "قصف", "bombing", "flood", "سيول", "earthquake", "زلزال",
        "fire", "حريق", "explosion", "انفجار", "shooting", "إطلاق",
        "collapse", "انهيار", "injured", "إصابات", "killed", "شهداء",
        "trapped", "محاصر", "evacuation", "إخلاء", "غارة", "airstrike",
        "شهيد", "martyrs", "جرحى", "wounded", "تدمير", "destruction",
        "صاروخ", "missile", "rocket", "قذيفة", "shell", "مجزرة", "massacre",
    ]
    text_lower = text.lower()
    keyword_hit = any(kw in text_lower for kw in crisis_keywords)

    try:
        result = await _call_glm(system, f"Message: {text}")
        parsed = json.loads(result)

        # Sanity check: if strong crisis keywords are present but AI said
        # not a crisis, override — false negatives can cost lives.
        if not parsed.get("is_crisis") and keyword_hit:
            logger.warning(
                "AI classified as non-crisis but crisis keywords detected, overriding: %s",
                text[:100],
            )
            return {"is_crisis": True, "confidence": 0.6, "category": "keyword_override"}

        return parsed
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        # Fallback: keyword-based classification
        return {
            "is_crisis": keyword_hit,
            "confidence": 0.3 if keyword_hit else 0.1,
            "category": "unknown",
        }


async def extract_crisis_info(text: str) -> Optional[dict]:
    """
    Extract structured crisis information from a message.
    Returns event type, severity, location, details, estimated casualties.
    """
    system = """You are a crisis information extraction agent for an emergency response system in Palestine.
Extract structured crisis information from the message.

For location, try to identify specific places, neighborhoods, or areas mentioned.
If you can estimate GPS coordinates for well-known locations in Palestine/Gaza, include them.

Respond ONLY with valid JSON:
{
  "event_type": "flood|bombing|earthquake|fire|building_collapse|shooting|chemical|medical_emergency|infrastructure|other",
  "severity": "low|medium|high|critical",
  "location_text": "extracted location name",
  "latitude": null or float,
  "longitude": null or float,
  "details": "brief summary of what happened",
  "confidence": 0.0-1.0,
  "affected_count": null or int,
  "urgency": "low|medium|high|immediate"
}"""

    try:
        result = await _call_glm(system, f"Message: {text}")
        return json.loads(result)
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return None


async def detect_knowledge_gaps(existing_topics: list[str], region: str = "Gaza") -> list[dict]:
    """
    Analyze current knowledge base topics and identify gaps.
    Returns suggestions for new Telegram channels to join.
    """
    system = """You are an intelligence analyst for a humanitarian crisis response system in Palestine.
Given the topics we already have data on, identify knowledge gaps that could save lives.

Suggest specific types of Telegram channels that could fill these gaps.

Respond ONLY with valid JSON array:
[
  {
    "gap": "description of missing information",
    "priority": "high|medium|low",
    "suggested_search_terms": ["term1", "term2"],
    "channel_type": "news|medical|logistics|community|government"
  }
]"""

    topics_str = ", ".join(existing_topics) if existing_topics else "none"
    message = f"Region: {region}\nExisting topics covered: {topics_str}\nWhat critical information are we missing?"

    try:
        result = await _call_glm(system, message)
        return json.loads(result)
    except Exception as e:
        logger.error(f"Gap detection failed: {e}")
        return []


async def assess_priority(
    sos_data: dict,
    patient_info: dict | None = None,
    medical_records: list[dict] | None = None,
    nearby_alerts: list[dict] | None = None,
    nearby_telegram_events: list[dict] | None = None,
) -> dict:
    """
    AI-powered priority assessment that factors in:
    - Patient vulnerability (medical conditions, mobility, living situation)
    - Nearby alert density (more alerts in the area = higher priority)
    - Telegram intelligence about the area
    - SOS severity and patient status

    Returns: {"priority_score": 0-100, "priority_factors": [...], "recommendation": str}
    """
    # Build rich context for the AI
    context_parts = []

    # SOS basics
    context_parts.append(f"SOS Severity: {sos_data.get('severity', 3)}/5")
    context_parts.append(f"Patient Status: {sos_data.get('patient_status', 'unknown')}")
    if sos_data.get("details"):
        context_parts.append(f"Details: {sos_data['details']}")

    # Patient vulnerability
    if patient_info:
        mobility = patient_info.get("mobility", "unknown")
        living = patient_info.get("living_situation", "unknown")
        context_parts.append(f"Patient Mobility: {mobility}")
        context_parts.append(f"Living Situation: {living}")
        trust = patient_info.get("trust_score", 1.0)
        false_alarms = patient_info.get("false_alarm_count", 0)
        total_sos = patient_info.get("total_sos_count", 0)
        context_parts.append(f"Patient Trust Score: {trust:.2f} (false alarms: {false_alarms}/{total_sos} total SOS)")
        if trust < 0.5:
            context_parts.append("WARNING: This patient has a low trust score due to multiple false alarm reports")

    # Medical records
    if medical_records:
        conditions = []
        equipment = []
        for rec in medical_records:
            conditions.extend(rec.get("conditions", []))
            equipment.extend(rec.get("special_equipment", []))
        if conditions:
            context_parts.append(f"Medical Conditions: {', '.join(set(conditions))}")
        if equipment:
            context_parts.append(f"Required Equipment: {', '.join(set(equipment))}")

    # Alert density
    if nearby_alerts:
        context_parts.append(f"Active alerts within 5km: {len(nearby_alerts)}")
        types = [a.get("event_type", "unknown") for a in nearby_alerts]
        from collections import Counter
        type_counts = Counter(types)
        context_parts.append(f"Nearby alert types: {dict(type_counts)}")
        severities = [a.get("severity", "low") for a in nearby_alerts]
        critical_count = sum(1 for s in severities if s in ("critical", "high"))
        context_parts.append(f"Critical/High alerts nearby: {critical_count}")

    # Telegram intel
    if nearby_telegram_events:
        context_parts.append(f"Telegram-sourced events nearby: {len(nearby_telegram_events)}")
        for evt in nearby_telegram_events[:3]:
            context_parts.append(f"  - {evt.get('title', 'Unknown event')} (severity: {evt.get('severity', 1)})")

    context_text = "\n".join(context_parts)

    system_prompt = """You are an emergency priority assessment AI for a humanitarian crisis response system in Palestine/Gaza.
Given all available context about an SOS request, calculate a priority score from 0 to 100.

Priority factors to weigh:
- Patient vulnerability: bedridden, wheelchair-bound, or living alone patients get +15-25 points
- Medical conditions: chronic conditions (diabetes, heart disease, respiratory) that may worsen in crisis get +10-20 points
- Special equipment dependency: patients needing oxygen, dialysis, etc. get +15-25 points (life-threatening if disrupted)
- Area alert density: many alerts in one area indicate a larger crisis, +10-20 points for high-density clusters
- Corroborating intelligence: if Telegram intel confirms active crisis at the location, +10-15 points
- SOS severity level: maps directly to base score (severity 5 = base 60, severity 1 = base 20)
- Patient status: trapped = +20, injured = +10
- Patient trust score: if trust score < 0.5, reduce priority by 10-20 points. If trust < 0.3, add "known_false_alarm_risk" to factors.
  BE CAREFUL: low trust doesn't mean ignore — a patient with history of false alarms could still have a real emergency. But reduce urgency if no corroborating evidence.

Respond ONLY with valid JSON:
{
  "priority_score": 0-100,
  "priority_factors": ["factor1: +X points", "factor2: +Y points"],
  "recommendation": "brief recommendation for responders",
  "estimated_response_urgency": "immediate|within_1h|within_4h|when_available"
}"""

    try:
        raw = await _call_glm(system_prompt, context_text, max_tokens=4096)
        result = json.loads(raw)
        # Ensure score is in valid range
        result["priority_score"] = max(0, min(100, int(result.get("priority_score", 50))))
        return result
    except Exception as e:
        logger.warning("AI priority assessment failed, using rule-based: %s", e)
        return _rule_based_priority(sos_data, patient_info, medical_records, nearby_alerts, nearby_telegram_events)


def _rule_based_priority(
    sos_data: dict,
    patient_info: dict | None = None,
    medical_records: list[dict] | None = None,
    nearby_alerts: list[dict] | None = None,
    nearby_telegram_events: list[dict] | None = None,
) -> dict:
    """Fallback rule-based priority scoring when AI is unavailable."""
    score = 0
    factors = []

    # Base score from SOS severity (1-5 → 10-50)
    sev = sos_data.get("severity", 3)
    base = sev * 10
    score += base
    factors.append(f"SOS severity {sev}/5: +{base}")

    # Patient status
    status = sos_data.get("patient_status", "")
    if status == "trapped":
        score += 20
        factors.append("Patient trapped: +20")
    elif status == "injured":
        score += 10
        factors.append("Patient injured: +10")

    # Patient vulnerability
    if patient_info:
        mobility = patient_info.get("mobility", "")
        if mobility in ("bedridden", "wheelchair"):
            score += 20
            factors.append(f"Mobility {mobility}: +20")
        living = patient_info.get("living_situation", "")
        if living == "alone":
            score += 10
            factors.append("Living alone: +10")

    # Medical conditions
    if medical_records:
        conditions = set()
        equipment = set()
        for rec in medical_records:
            conditions.update(rec.get("conditions", []))
            equipment.update(rec.get("special_equipment", []))
        if equipment:
            score += 20
            factors.append(f"Requires equipment ({', '.join(list(equipment)[:3])}): +20")
        elif conditions:
            score += 10
            factors.append(f"Has conditions ({', '.join(list(conditions)[:3])}): +10")

    # Alert density
    if nearby_alerts and len(nearby_alerts) >= 3:
        density_bonus = min(20, len(nearby_alerts) * 2)
        score += density_bonus
        factors.append(f"{len(nearby_alerts)} nearby alerts: +{density_bonus}")

    # Telegram intel corroboration
    if nearby_telegram_events and len(nearby_telegram_events) > 0:
        score += 10
        factors.append(f"Telegram intel confirms activity: +10")

    # Patient trust score penalty
    if patient_info:
        trust = patient_info.get("trust_score", 1.0)
        false_alarms = patient_info.get("false_alarm_count", 0)
        if trust < 0.3:
            penalty = 20
            score -= penalty
            factors.append(f"Low trust score ({trust:.2f}, {false_alarms} false alarms): -{penalty}")
        elif trust < 0.5:
            penalty = 10
            score -= penalty
            factors.append(f"Reduced trust ({trust:.2f}, {false_alarms} false alarms): -{penalty}")

    score = max(0, min(100, score))

    urgency = "when_available"
    if score >= 80:
        urgency = "immediate"
    elif score >= 60:
        urgency = "within_1h"
    elif score >= 40:
        urgency = "within_4h"

    return {
        "priority_score": score,
        "priority_factors": factors,
        "recommendation": f"Priority score {score}/100 based on {len(factors)} factors",
        "estimated_response_urgency": urgency,
    }


async def decide_channel_action(channel_info: dict, recent_messages: list[str]) -> dict:
    """
    Decide whether to keep monitoring, increase monitoring, or leave a channel.
    """
    system = """You are deciding whether a Telegram channel is valuable for crisis monitoring in Palestine.
Based on the channel info and recent messages, decide:
- "keep": Channel provides useful crisis-related information
- "increase": Channel is highly valuable, increase monitoring frequency
- "leave": Channel is not relevant to crisis monitoring

Respond ONLY with valid JSON:
{"action": "keep|increase|leave", "reason": "brief explanation", "value_score": 0.0-1.0}"""

    message = f"Channel: {json.dumps(channel_info)}\nRecent messages sample: {json.dumps(recent_messages[:5])}"

    try:
        result = await _call_glm(system, message)
        return json.loads(result)
    except Exception as e:
        logger.error(f"Channel decision failed: {e}")
        return {"action": "keep", "reason": "default", "value_score": 0.5}


async def verify_telegram_event(
    event_data: dict,
    corroborating_events: list[dict] | None = None,
    related_sos: list[dict] | None = None,
) -> dict:
    """
    Verify a Telegram-sourced event using cross-referencing.

    Checks:
    - Are there other reports about the same incident from different sources?
    - Are there SOS requests from patients in the same area?
    - Does the timing and location make sense?
    - Could this be a false flag? (e.g., fire reported but no injuries or SOS)

    Returns: {"verified": bool, "confidence": 0.0-1.0, "reasoning": str, "trust_delta": float}
    trust_delta is how much to adjust the channel's trust score (-0.1 to +0.1)
    """
    context_parts = [
        f"Event: {event_data.get('title', 'Unknown')}",
        f"Type: {event_data.get('event_type', 'unknown')}",
        f"Location: {event_data.get('latitude', '?')}, {event_data.get('longitude', '?')}",
        f"Time: {event_data.get('created_at', 'unknown')}",
        f"Source channel: {event_data.get('channel_name', 'unknown')}",
    ]

    if corroborating_events:
        context_parts.append(f"\nCorroborating events from other sources ({len(corroborating_events)}):")
        for evt in corroborating_events[:5]:
            context_parts.append(f"  - {evt.get('title', 'Unknown')} via {evt.get('source', '?')} ({evt.get('created_at', '?')})")
    else:
        context_parts.append("\nNo corroborating events found from other sources.")

    if related_sos:
        context_parts.append(f"\nRelated SOS requests from patients nearby ({len(related_sos)}):")
        for sos in related_sos[:5]:
            context_parts.append(f"  - Patient {sos.get('patient_status', '?')}, severity {sos.get('severity', '?')}")
    else:
        context_parts.append("\nNo SOS requests from patients in the area.")

    system_prompt = """You are a verification AI for a crisis response system. Your job is to assess whether
a Telegram-sourced event report is likely genuine or potentially false/unverifiable.

Consider:
- Corroboration: Are there multiple independent sources confirming this event?
- Patient activity: Are patients in the area reporting emergencies consistent with the event?
- False flag indicators: Events with no injuries/SOS could still be real (e.g., building fire evacuated safely)
  but could also be false reports. Be nuanced.
- Timing: Events that happened long ago with no corroboration are more suspicious.

Respond ONLY with valid JSON:
{
  "verified": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of verification decision",
  "trust_delta": -0.1 to 0.1 (how much to adjust channel trust: positive = more trusted, negative = less)
}"""

    try:
        raw = await _call_glm(system_prompt, "\n".join(context_parts), max_tokens=4096)
        result = json.loads(raw)
        result["trust_delta"] = max(-0.1, min(0.1, float(result.get("trust_delta", 0))))
        return result
    except Exception as e:
        logger.warning("Telegram event verification failed: %s", e)
        return {
            "verified": False,
            "confidence": 0.3,
            "reasoning": "Could not verify — AI unavailable",
            "trust_delta": 0.0,
        }
