"""
AI Triage Conversation — LLM-driven SOS triage chat (feature 2.2.13)
with a deterministic scripted fallback (feature 2.2.12 persistence is
handled by the route layer, which stores the transcript on
``SosRequest.triage_transcript``).

This module is pure conversation logic:

    transcript in  ->  next AI reply + quick replies + structured triage data out

Modes
-----
- ``"llm"``      GLM-5 (Zhipu) drives the conversation. Requires ``GLM_API_KEY``.
- ``"scripted"`` Deterministic question flow mirroring the frontend's offline
                 flow. Used when no API key is configured, or when the LLM
                 call fails or times out. The mobile client treats
                 ``mode == "scripted"`` as "drive the conversation locally".

Life-critical constraints
-------------------------
- The LLM call is hard-capped at ``LLM_TIMEOUT_SECONDS`` so a slow model can
  never stall an emergency. Client-side auto-send timers keep running
  regardless of what happens here.
- Urgency keywords are re-checked server-side on every user message
  (defense in depth — the client checks them locally first).
"""

import json
import logging
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.services.ai_agent.agent import GLM_API_URL, GLM_MODEL, _extract_json

logger = logging.getLogger(__name__)
settings = get_settings()

# Keep LLM latency bounded — the client falls back to its local scripted flow
# on its own timeout, and unresponsive/auto-send timers are never paused.
LLM_TIMEOUT_SECONDS = 12
MAX_TRANSCRIPT_FOR_LLM = 40    # cap context messages sent to the LLM
MAX_QUESTIONS = 8              # mirrors frontend SOS_CONFIG.MAX_QUESTIONS
LOW_BATTERY_MAX_QUESTIONS = 2  # mirrors frontend SOS_CONFIG.LOW_BATTERY_MAX_QUESTIONS
TARGET_QUESTIONS = 5           # normal-mode target before wrapping up

# Mirrors frontend URGENCY_KEYWORDS (+ Arabic equivalents).
URGENCY_KEYWORDS = [
    "help", "now", "send", "hurry", "dying", "blood", "emergency", "quick",
    "fast", "urgent",
    "النجدة", "ساعدوني", "الآن", "أرسلوا", "بسرعة", "أموت", "دم", "طوارئ",
    "عاجل", "إسعاف",
]

# Deterministic scripted flow — mirrors frontend AI_CONVERSATION_FLOW.
SCRIPTED_FLOW: list[dict[str, Any]] = [
    {
        "id": "emergency_type",
        "question": "What is your emergency case?",
        "options": [
            {"id": "medical", "label": "Medical"},
            {"id": "danger", "label": "Danger"},
            {"id": "trapped", "label": "Trapped"},
            {"id": "evacuate", "label": "Evacuate"},
        ],
    },
    {
        "id": "injured",
        "question": "Are you or anyone injured?",
        "options": [
            {"id": "serious", "label": "Yes, serious"},
            {"id": "minor", "label": "Yes, minor"},
            {"id": "none", "label": "No injuries"},
        ],
    },
    {
        "id": "people_count",
        "question": "How many people need help?",
        "options": [
            {"id": "just_me", "label": "Just me"},
            {"id": "2_3_people", "label": "2-3 people"},
            {"id": "more_than_3", "label": "More than 3"},
        ],
    },
    {
        "id": "can_move",
        "question": "Can you move to safety?",
        "options": [
            {"id": "can_move", "label": "Yes"},
            {"id": "trapped", "label": "No, trapped"},
            {"id": "injured", "label": "No, injured"},
        ],
    },
    {
        "id": "details",
        "question": "Any other details? (optional)",
        "options": [],
    },
]

VALID_EMERGENCY_TYPES = {"medical", "danger", "trapped", "evacuate"}
VALID_INJURY_STATUS = {"serious", "minor", "none"}
VALID_PEOPLE_COUNT = {"just_me", "2_3_people", "more_than_3"}
VALID_CAN_MOVE = {"can_move", "trapped", "injured"}
VALID_PATIENT_STATUS = {"safe", "injured", "trapped", "evacuate"}

_SENDING_MESSAGE = {
    "en": "Understood. Your information has been sent to responders. Stay as safe as you can.",
    "ar": "مفهوم. تم إرسال معلوماتك إلى فرق الاستجابة. حاول أن تبقى في مكان آمن قدر الإمكان.",
}
_URGENT_MESSAGE = {
    "en": "Sending your SOS with everything you told me right now. Help is on the way.",
    "ar": "جارٍ إرسال نداء الاستغاثة مع كل المعلومات الآن. المساعدة في الطريق.",
}


def is_llm_available() -> bool:
    """LLM mode is available only when a GLM API key is configured."""
    return bool(settings.GLM_API_KEY)


def contains_urgency_keyword(text: str) -> bool:
    lower = (text or "").lower()
    return any(kw in lower for kw in URGENCY_KEYWORDS)


def _count_user_messages(transcript: list[dict]) -> int:
    return sum(1 for m in transcript if m.get("role") == "user")


def _last_user_message(transcript: list[dict]) -> str:
    for m in reversed(transcript):
        if m.get("role") == "user":
            return str(m.get("content", ""))
    return ""


def _msg_text(language: str, table: dict[str, str]) -> str:
    return table.get("ar" if (language or "").startswith("ar") else "en", table["en"])


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def normalize_triage_data(raw: Any) -> dict[str, Any]:
    """Whitelist + clamp structured triage extraction from the LLM."""
    out: dict[str, Any] = {}
    if not isinstance(raw, dict):
        return out

    def pick(key: str, valid: set[str]) -> None:
        v = raw.get(key)
        if isinstance(v, str):
            v = v.strip().lower().replace(" ", "_").replace("-", "_")
            if v in valid:
                out[key] = v

    pick("emergency_type", VALID_EMERGENCY_TYPES)
    pick("injury_status", VALID_INJURY_STATUS)
    pick("people_count", VALID_PEOPLE_COUNT)
    pick("can_move", VALID_CAN_MOVE)
    pick("patient_status", VALID_PATIENT_STATUS)

    sev = raw.get("severity")
    if isinstance(sev, (int, float)) or (isinstance(sev, str) and sev.strip().isdigit()):
        try:
            out["severity"] = max(1, min(5, int(sev)))
        except (TypeError, ValueError):
            pass

    details = raw.get("additional_details") or raw.get("details")
    if isinstance(details, str) and details.strip():
        out["additional_details"] = details.strip()[:2000]

    return out


def normalize_quick_replies(raw: Any) -> list[dict[str, str]]:
    """Sanitize quick reply suggestions: max 4, short labels, string ids."""
    replies: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return replies
    for item in raw[:4]:
        if isinstance(item, str):
            label = item.strip()[:40]
            if label:
                replies.append({"id": label.lower().replace(" ", "_")[:32], "label": label})
        elif isinstance(item, dict):
            label = str(item.get("label", "")).strip()[:40]
            rid = str(item.get("id", "")).strip()[:32]
            if label:
                replies.append({"id": rid or label.lower().replace(" ", "_")[:32], "label": label})
    return replies


def derive_patient_status(triage_data: dict[str, Any]) -> Optional[str]:
    """Map extracted triage data to a PatientStatus enum value (conservative)."""
    ps = triage_data.get("patient_status")
    if ps in VALID_PATIENT_STATUS:
        return ps
    et = triage_data.get("emergency_type")
    if et == "trapped" or triage_data.get("can_move") == "trapped":
        return "trapped"
    if et == "evacuate":
        return "evacuate"
    if triage_data.get("injury_status") in ("serious", "minor"):
        return "injured"
    return None


def derive_severity(triage_data: dict[str, Any]) -> Optional[int]:
    """Severity 1-5 from extraction — mirrors the frontend mapping."""
    sev = triage_data.get("severity")
    if isinstance(sev, int):
        return max(1, min(5, sev))
    injury = triage_data.get("injury_status")
    if injury == "serious":
        return 5
    if injury == "minor":
        return 3
    if injury == "none":
        return 1
    return None


def build_details_summary(triage_data: dict[str, Any]) -> str:
    """Compact responder-facing summary — same format the frontend builds."""
    parts: list[str] = []
    if triage_data.get("emergency_type"):
        parts.append(f"Type: {triage_data['emergency_type']}")
    if triage_data.get("injury_status"):
        parts.append(f"Injury: {triage_data['injury_status']}")
    if triage_data.get("people_count"):
        parts.append(f"People: {triage_data['people_count'].replace('_', ' ')}")
    if triage_data.get("can_move"):
        parts.append(f"Mobility: {triage_data['can_move'].replace('_', ' ')}")
    if triage_data.get("additional_details"):
        parts.append(f"Details: {triage_data['additional_details']}")
    return "; ".join(parts)


# ---------------------------------------------------------------------------
# Scripted (deterministic) fallback engine
# ---------------------------------------------------------------------------

def _scripted_extract(transcript: list[dict]) -> dict[str, Any]:
    """Best-effort keyword extraction for the deterministic flow.

    Pairs each user answer with the scripted question that preceded it
    (matched by question text) and applies the same keyword mapping the
    frontend uses.
    """
    data: dict[str, Any] = {}
    question_by_text = {q["question"]: q["id"] for q in SCRIPTED_FLOW}
    last_qid: Optional[str] = None

    for msg in transcript:
        role = msg.get("role")
        content = str(msg.get("content", ""))
        if role == "ai":
            qid = question_by_text.get(content.strip())
            if qid:
                last_qid = qid
            continue
        if role != "user" or not last_qid:
            continue

        lower = content.lower()
        if last_qid == "emergency_type":
            for et in ("medical", "danger", "trapped", "evacuate"):
                if et in lower:
                    data["emergency_type"] = et
                    break
        elif last_qid == "injured":
            if "serious" in lower:
                data["injury_status"] = "serious"
            elif "minor" in lower:
                data["injury_status"] = "minor"
            elif "no" in lower:
                data["injury_status"] = "none"
        elif last_qid == "people_count":
            if "just me" in lower or lower.strip() == "1":
                data["people_count"] = "just_me"
            elif any(t in lower for t in ("2", "3", "few")):
                data["people_count"] = "2_3_people"
            elif "more" in lower or "many" in lower:
                data["people_count"] = "more_than_3"
        elif last_qid == "can_move":
            if "trapped" in lower:
                data["can_move"] = "trapped"
            elif "yes" in lower or "can" in lower:
                data["can_move"] = "can_move"
            elif "injured" in lower or "no" in lower:
                data["can_move"] = "injured"
        elif last_qid == "details" and content.strip():
            data["additional_details"] = content.strip()[:2000]
        last_qid = None

    return data


def scripted_turn(
    transcript: list[dict],
    *,
    battery_low: bool = False,
    language: str = "en",
) -> dict[str, Any]:
    """Deterministic next step. Never raises; needs no network."""
    answered = _count_user_messages(transcript)
    max_questions = LOW_BATTERY_MAX_QUESTIONS if battery_low else len(SCRIPTED_FLOW)
    triage_data = _scripted_extract(transcript)

    if answered >= max_questions or answered >= len(SCRIPTED_FLOW):
        return {
            "mode": "scripted",
            "message": _msg_text(language, _SENDING_MESSAGE),
            "quick_replies": [],
            "triage_data": triage_data,
            "conversation_complete": True,
            "urgency_detected": False,
        }

    question = SCRIPTED_FLOW[answered]
    return {
        "mode": "scripted",
        "message": question["question"],
        "quick_replies": list(question["options"]),
        "triage_data": triage_data,
        "conversation_complete": False,
        "urgency_detected": False,
    }


# ---------------------------------------------------------------------------
# LLM engine
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are the emergency triage assistant inside TMT, an emergency-response app used during disasters in Palestine.

CONTEXT: The user pressed the SOS button. Their SOS and GPS location were ALREADY sent to responders — this chat only gathers extra triage details to help responders prepare. Never imply that help is waiting on their answers.

CONVERSATION RULES:
- Ask exactly ONE short question per turn (under 15 words). Calm, simple words. No medical jargon. Never promise arrival times.
- Priority of information (skip anything already known from the conversation):
  1. type of emergency, 2. injuries and how serious, 3. number of people needing help, 4. whether they can move or are trapped, 5. immediate hazards / other details.
- Offer 2-4 tap-friendly quick replies (max 4 words each) matching your question. Use [] when free text is expected.
- Reply in the user's language: if they write in Arabic (or language hint is "ar"), respond in Arabic.
- The user may be injured, panicking, or typing with one hand. Accept fragmentary answers; never scold or repeat a question they already answered.
- Ask at most {max_questions} questions total, then finish. Finish EARLY once items 1-2 are known if answers suggest a serious situation.
- When finishing: set conversation_complete=true and make "message" one short reassuring sentence confirming their info was passed to responders.
- URGENT: if any message indicates an immediate life threat (heavy bleeding, not breathing, active fire, collapsing building, unconscious person), set urgency_detected=true AND conversation_complete=true immediately.

EXTRACTION — maintain a cumulative "triage_data" object using ONLY these values:
- emergency_type: "medical" | "danger" | "trapped" | "evacuate"
- injury_status: "serious" | "minor" | "none"
- people_count: "just_me" | "2_3_people" | "more_than_3"
- can_move: "can_move" | "trapped" | "injured"
- patient_status: "safe" | "injured" | "trapped" | "evacuate"
- severity: integer 1-5 (5 = life-threatening, 3 = needs medical care, 1 = safe/no injuries)
- additional_details: short free-text summary useful to responders (in English), including hazards, exact position hints, ages of children, etc.
Omit keys you do not know yet. Update keys when the user corrects themselves.

OUTPUT: Respond ONLY with valid JSON, no prose, no markdown:
{{"message": "next question or closing sentence", "quick_replies": [{{"id": "snake_case_id", "label": "Short label"}}], "triage_data": {{...}}, "conversation_complete": false, "urgency_detected": false}}"""


def _transcript_to_llm_messages(transcript: list[dict]) -> list[dict[str, str]]:
    """Map stored transcript to OpenAI-style messages, merging consecutive roles."""
    messages: list[dict[str, str]] = []
    for msg in transcript[-MAX_TRANSCRIPT_FOR_LLM:]:
        role = "assistant" if msg.get("role") == "ai" else "user"
        content = str(msg.get("content", "")).strip()
        if not content:
            continue
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + content
        else:
            messages.append({"role": role, "content": content})
    return messages


async def llm_turn(
    transcript: list[dict],
    *,
    battery_low: bool = False,
    language: str = "en",
    patient_context: Optional[dict] = None,
) -> dict[str, Any]:
    """One LLM-driven conversation turn. Raises on any failure —
    callers must catch and fall back to :func:`scripted_turn`."""
    max_questions = LOW_BATTERY_MAX_QUESTIONS if battery_low else TARGET_QUESTIONS
    system = _SYSTEM_PROMPT.format(max_questions=max_questions)

    if battery_low:
        system += "\nIMPORTANT: The user's phone battery is critically low. Wrap up within 2 questions."
    if language:
        system += f"\nLanguage hint from the app: {language}"
    if patient_context:
        compact = {k: v for k, v in patient_context.items() if v}
        if compact:
            system += (
                "\nKnown patient profile (do not re-ask these): "
                + json.dumps(compact, ensure_ascii=False, default=str)[:600]
            )

    messages = [{"role": "system", "content": system}]
    messages.extend(_transcript_to_llm_messages(transcript))
    if len(messages) == 1 or messages[-1]["role"] != "user":
        # The model must always see a final user turn to respond to.
        messages.append({"role": "user", "content": "(The user has not answered yet. Ask your first/next question.)"})

    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        response = await client.post(
            GLM_API_URL,
            headers={
                "Authorization": f"Bearer {settings.GLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GLM_MODEL,
                "max_tokens": 1024,
                "temperature": 0.4,
                "messages": messages,
            },
        )
        response.raise_for_status()
        data = response.json()

    msg = (data.get("choices") or [{}])[0].get("message", {})
    raw = msg.get("content", "") or msg.get("reasoning_content", "")
    parsed = json.loads(_extract_json(raw))

    message_text = str(parsed.get("message", "")).strip()
    if not message_text:
        raise ValueError("LLM returned an empty triage message")

    triage_data = normalize_triage_data(parsed.get("triage_data"))
    complete = bool(parsed.get("conversation_complete"))
    urgent = bool(parsed.get("urgency_detected"))

    # Hard safety cap — never let the model interrogate forever.
    if _count_user_messages(transcript) >= (LOW_BATTERY_MAX_QUESTIONS if battery_low else MAX_QUESTIONS):
        complete = True

    return {
        "mode": "llm",
        "message": message_text[:1000],
        "quick_replies": [] if complete else normalize_quick_replies(parsed.get("quick_replies")),
        "triage_data": triage_data,
        "conversation_complete": complete or urgent,
        "urgency_detected": urgent,
    }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run_triage_turn(
    transcript: list[dict],
    *,
    battery_low: bool = False,
    language: str = "en",
    patient_context: Optional[dict] = None,
) -> dict[str, Any]:
    """Produce the next AI turn. Never raises.

    Order of precedence:
      1. Urgency keyword in the latest user message → finish immediately
         (deterministic, zero latency — a life may depend on it).
      2. LLM turn when a key is configured (bounded by LLM_TIMEOUT_SECONDS).
      3. Deterministic scripted turn (also the landing spot when the LLM
         fails — marked ``mode="scripted"`` so clients switch to their
         local offline flow).
    """
    last_user = _last_user_message(transcript)
    if last_user and contains_urgency_keyword(last_user):
        return {
            "mode": "llm" if is_llm_available() else "scripted",
            "message": _msg_text(language, _URGENT_MESSAGE),
            "quick_replies": [],
            "triage_data": _scripted_extract(transcript),
            "conversation_complete": True,
            "urgency_detected": True,
        }

    if is_llm_available():
        try:
            return await llm_turn(
                transcript,
                battery_low=battery_low,
                language=language,
                patient_context=patient_context,
            )
        except Exception as exc:  # noqa: BLE001 — any failure degrades gracefully
            logger.warning("LLM triage turn failed, falling back to scripted: %s", exc)

    return scripted_turn(transcript, battery_low=battery_low, language=language)
