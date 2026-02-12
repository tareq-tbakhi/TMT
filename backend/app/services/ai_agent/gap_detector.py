"""
Knowledge Gap Detector — analyzes current intelligence in Qdrant
and identifies areas where more data collection is needed.
"""
import logging
from datetime import datetime, timedelta

from app.services.ai_agent.agent import detect_knowledge_gaps
from app.services.ai_agent.embeddings import get_knowledge_topics, search_similar
from app.telegram.channel_manager import add_channel, get_monitored_channels

logger = logging.getLogger(__name__)

# Regions and topics we want to maintain coverage for
REQUIRED_COVERAGE = {
    "regions": ["Gaza", "Khan Younis", "Rafah", "Gaza City", "Jabalia", "Deir al-Balah"],
    "topics": ["medical_supplies", "casualties", "infrastructure", "evacuation", "food_water", "shelter"],
}


async def analyze_gaps() -> list[dict]:
    """
    Analyze the current knowledge base and identify critical gaps.
    Returns a list of gaps with suggested actions.
    """
    # Get current topics in knowledge base
    existing_topics = await get_knowledge_topics()

    # Check coverage for each required region
    gaps = []
    for region in REQUIRED_COVERAGE["regions"]:
        results = await search_similar(f"crisis situation in {region}", limit=5)
        if len(results) < 2:
            gaps.append({
                "type": "region_gap",
                "region": region,
                "message": f"Insufficient data coverage for {region}",
                "priority": "high",
            })

    # Check topic coverage
    for topic in REQUIRED_COVERAGE["topics"]:
        results = await search_similar(topic, limit=5)
        recent = [r for r in results if r.get("metadata", {}).get("date")]
        if len(recent) < 1:
            gaps.append({
                "type": "topic_gap",
                "topic": topic,
                "message": f"No recent data on {topic}",
                "priority": "medium",
            })

    # Use AI to detect additional gaps
    ai_gaps = await detect_knowledge_gaps(existing_topics)
    for gap in ai_gaps:
        gaps.append({
            "type": "ai_detected",
            "message": gap.get("gap", ""),
            "priority": gap.get("priority", "medium"),
            "suggested_searches": gap.get("suggested_search_terms", []),
        })

    return gaps


async def fill_gaps(gaps: list[dict]):
    """
    Attempt to fill identified knowledge gaps by joining new channels.
    """
    current_channels = get_monitored_channels()
    current_usernames = {c["username"] for c in current_channels}

    for gap in gaps:
        if gap.get("priority") != "high":
            continue

        search_terms = gap.get("suggested_searches", [])
        for term in search_terms:
            # This would ideally search Telegram for channels
            # For now, log the suggestion
            logger.info(f"Gap fill suggestion: search for '{term}' channels")


async def run_gap_detection_cycle():
    """Run a full gap detection and filling cycle."""
    logger.info("Starting gap detection cycle")
    gaps = await analyze_gaps()
    logger.info(f"Found {len(gaps)} knowledge gaps")
    await fill_gaps(gaps)
    logger.info("Gap detection cycle complete")
    return gaps
