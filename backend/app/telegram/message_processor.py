"""
Message Processor — takes raw Telegram messages, classifies them,
extracts crisis information, geocodes locations, stores embeddings.
"""
import json
import logging
from datetime import datetime

from app.services.ai_agent.agent import classify_message, extract_crisis_info
from app.services.ai_agent.embeddings import generate_embedding, store_embedding

logger = logging.getLogger(__name__)


async def process_message(message: dict, db=None) -> dict | None:
    """
    Full message processing pipeline:
    1. Classify as crisis/not-crisis
    2. If crisis: extract structured info
    3. Geocode location
    4. Generate and store embedding
    5. Return processed data for alert creation
    """
    text = message.get("text", "")
    if not text or len(text) < 10:
        return None

    # Step 1: Classify
    classification = await classify_message(text)
    if not classification.get("is_crisis"):
        # Still store embedding for knowledge base
        embedding = await generate_embedding(text)
        if embedding:
            await store_embedding(
                text=text,
                embedding=embedding,
                metadata={
                    "source": "telegram",
                    "channel": message.get("channel"),
                    "date": message.get("date"),
                    "is_crisis": False,
                },
            )
        return None

    # Step 2: Extract structured crisis info
    crisis_info = await extract_crisis_info(text)
    if not crisis_info:
        return None

    # Step 3: Generate and store embedding
    embedding = await generate_embedding(text)
    if embedding:
        await store_embedding(
            text=text,
            embedding=embedding,
            metadata={
                "source": "telegram",
                "channel": message.get("channel"),
                "date": message.get("date"),
                "is_crisis": True,
                "event_type": crisis_info.get("event_type"),
                "severity": crisis_info.get("severity"),
                "location_text": crisis_info.get("location_text"),
            },
        )

    # Return processed data for downstream alert creation
    return {
        "source": "telegram",
        "channel": message.get("channel"),
        "message_id": message.get("id"),
        "original_text": text,
        "event_type": crisis_info.get("event_type", "other"),
        "severity": crisis_info.get("severity", "medium"),
        "location_text": crisis_info.get("location_text"),
        "latitude": crisis_info.get("latitude"),
        "longitude": crisis_info.get("longitude"),
        "details": crisis_info.get("details"),
        "confidence": crisis_info.get("confidence", 0.5),
        "affected_count": crisis_info.get("affected_count"),
        "timestamp": message.get("date", datetime.utcnow().isoformat()),
    }


async def process_batch(messages: list[dict], db=None) -> list[dict]:
    """Process a batch of messages and return crisis events."""
    results = []
    for message in messages:
        result = await process_message(message, db=db)
        if result:
            results.append(result)
    return results
