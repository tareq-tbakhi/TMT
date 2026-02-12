"""
AI Agent — Core decision-making engine using Claude API.
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

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"


async def _call_claude(system_prompt: str, user_message: str, max_tokens: int = 1024) -> str:
    """Make a call to Claude API."""
    if not settings.CLAUDE_API_KEY:
        logger.warning("Claude API key not configured, using fallback")
        return "{}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": settings.CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-5-20250929",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_message}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]


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

    try:
        result = await _call_claude(system, f"Message: {text}")
        return json.loads(result)
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        # Fallback: keyword-based classification
        crisis_keywords = [
            "قصف", "bombing", "flood", "سيول", "earthquake", "زلزال",
            "fire", "حريق", "explosion", "انفجار", "shooting", "إطلاق",
            "collapse", "انهيار", "injured", "إصابات", "killed", "شهداء",
            "trapped", "محاصر", "evacuation", "إخلاء",
        ]
        text_lower = text.lower()
        is_crisis = any(kw in text_lower for kw in crisis_keywords)
        return {"is_crisis": is_crisis, "confidence": 0.3 if is_crisis else 0.1, "category": "unknown"}


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
        result = await _call_claude(system, f"Message: {text}")
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
        result = await _call_claude(system, message)
        return json.loads(result)
    except Exception as e:
        logger.error(f"Gap detection failed: {e}")
        return []


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
        result = await _call_claude(system, message)
        return json.loads(result)
    except Exception as e:
        logger.error(f"Channel decision failed: {e}")
        return {"action": "keep", "reason": "default", "value_score": 0.5}
