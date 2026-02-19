"""
News feed API routes.

Serves processed Telegram intelligence and crisis alerts as news articles
for the patient mobile app.

Endpoints:
    GET /news         — List news articles (public, patient-facing)
    GET /news/{id}    — Get article detail
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.geo_event import GeoEvent, GeoEventSource
from app.models.alert import Alert, AlertSeverity, EventType
from app.models.telegram_channel import TelegramChannel
from app.api.middleware.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class NewsArticleResponse(BaseModel):
    id: str
    title: str
    summary: str
    content: Optional[str] = None
    source_platform: str
    source_url: Optional[str] = None
    source_author: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    distance_km: Optional[float] = None
    trust_score: float
    priority_score: float
    relevance_tags: list[str]
    category: str  # threat, update, warning, info
    severity: str  # critical, high, medium, low
    event_type: Optional[str] = None
    media_urls: list[str] = []
    engagement_count: int = 0
    verified: bool = False
    published_at: str
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Map EventType to news category
EVENT_TYPE_TO_CATEGORY = {
    EventType.BOMBING: "threat",
    EventType.SHOOTING: "threat",
    EventType.CHEMICAL: "threat",
    EventType.FIRE: "warning",
    EventType.FLOOD: "warning",
    EventType.EARTHQUAKE: "warning",
    EventType.BUILDING_COLLAPSE: "warning",
    EventType.INFRASTRUCTURE: "update",
    EventType.MEDICAL_EMERGENCY: "update",
    EventType.OTHER: "info",
}

# Map severity int (1-5) to news severity string
SEVERITY_INT_TO_STR = {
    5: "critical",
    4: "critical",
    3: "high",
    2: "medium",
    1: "low",
}

ALERT_SEVERITY_TO_STR = {
    AlertSeverity.CRITICAL: "critical",
    AlertSeverity.HIGH: "high",
    AlertSeverity.MEDIUM: "medium",
    AlertSeverity.LOW: "low",
}


def _geo_event_to_article(event: GeoEvent, trust: float = 50.0) -> dict:
    """Convert a GeoEvent (from Telegram) to a NewsArticle response dict."""
    meta = event.metadata_ or {}
    severity_str = SEVERITY_INT_TO_STR.get(event.severity, "medium")

    # Compute priority score from severity + trust
    priority = (event.severity / 5.0) * 60 + (trust / 100.0) * 40

    # Determine category
    try:
        et = EventType(event.event_type) if isinstance(event.event_type, str) else event.event_type
        category = EVENT_TYPE_TO_CATEGORY.get(et, "info")
    except (ValueError, KeyError):
        category = "info"

    return {
        "id": str(event.id),
        "title": event.title or f"Crisis Report: {event.event_type}",
        "summary": (event.details or "")[:300] or event.title or "No details available",
        "content": event.details,
        "source_platform": "telegram" if event.source == GeoEventSource.TELEGRAM else str(event.source.value if event.source else "other"),
        "source_url": None,
        "source_author": meta.get("channel"),
        "latitude": event.latitude,
        "longitude": event.longitude,
        "location_name": None,
        "distance_km": None,
        "trust_score": trust,
        "priority_score": round(priority, 1),
        "relevance_tags": [str(event.event_type), event.layer or "intel"],
        "category": category,
        "severity": severity_str,
        "event_type": str(event.event_type) if event.event_type else None,
        "media_urls": [],
        "engagement_count": 0,
        "verified": trust >= 70,
        "published_at": event.created_at.isoformat() if event.created_at else datetime.utcnow().isoformat(),
        "created_at": event.created_at.isoformat() if event.created_at else datetime.utcnow().isoformat(),
    }


def _alert_to_article(alert: Alert) -> dict:
    """Convert an Alert (from any source) to a NewsArticle response dict."""
    meta = alert.metadata_ or {}
    severity_str = ALERT_SEVERITY_TO_STR.get(alert.severity, "medium")

    try:
        category = EVENT_TYPE_TO_CATEGORY.get(alert.event_type, "info")
    except (ValueError, KeyError):
        category = "info"

    confidence = alert.confidence or 0.5
    trust = confidence * 100
    priority = ({"critical": 5, "high": 4, "medium": 3, "low": 2}.get(severity_str, 2) / 5.0) * 60 + (trust / 100.0) * 40

    return {
        "id": str(alert.id),
        "title": alert.title,
        "summary": (alert.details or "")[:300] or alert.title,
        "content": alert.details,
        "source_platform": alert.source or "system",
        "source_url": None,
        "source_author": meta.get("channel"),
        "latitude": alert.latitude,
        "longitude": alert.longitude,
        "location_name": None,
        "distance_km": None,
        "trust_score": round(trust, 1),
        "priority_score": round(priority, 1),
        "relevance_tags": [str(alert.event_type.value) if alert.event_type else "other", alert.source or "system"],
        "category": category,
        "severity": severity_str,
        "event_type": str(alert.event_type.value) if alert.event_type else None,
        "media_urls": [],
        "engagement_count": alert.affected_patients_count or 0,
        "verified": confidence >= 0.7,
        "published_at": alert.created_at.isoformat() if alert.created_at else datetime.utcnow().isoformat(),
        "created_at": alert.created_at.isoformat() if alert.created_at else datetime.utcnow().isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/news")
async def list_news(
    category: Optional[str] = Query(None, description="Filter: threat, warning, update, info"),
    severity: Optional[str] = Query(None, description="Filter: critical, high, medium, low"),
    source: Optional[str] = Query(None, description="Filter by source: telegram, system, sos"),
    hours: int = Query(48, ge=1, le=720, description="Look back N hours"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List news articles for the patient feed.

    Combines GeoEvents (Telegram intel layer) and Alerts (from all sources)
    into a unified news feed sorted by priority + recency.
    """
    since = datetime.utcnow() - timedelta(hours=hours)

    # Build a cache of Telegram channel trust scores
    trust_cache: dict[str, float] = {}
    try:
        result = await db.execute(
            select(TelegramChannel.channel_id, TelegramChannel.trust_score)
        )
        for row in result.all():
            trust_cache[row[0]] = (row[1] or 0.5) * 100  # Convert 0-1 to 0-100
    except Exception:
        pass

    articles: list[dict] = []

    # Source 1: GeoEvents from Telegram intel
    try:
        geo_q = (
            select(GeoEvent)
            .where(GeoEvent.layer == "telegram_intel")
            .where(GeoEvent.created_at >= since)
            .order_by(desc(GeoEvent.severity), desc(GeoEvent.created_at))
            .limit(limit * 2)
        )
        geo_result = await db.execute(geo_q)
        for event in geo_result.scalars().all():
            meta = event.metadata_ or {}
            channel_id = meta.get("channel", "")
            trust = trust_cache.get(str(channel_id), 50.0)
            articles.append(_geo_event_to_article(event, trust))
    except Exception as e:
        logger.warning("Failed to fetch GeoEvents for news: %s", e)

    # Source 2: Alerts with source=telegram or source=system
    try:
        alert_q = (
            select(Alert)
            .where(Alert.created_at >= since)
            .where(Alert.source.in_(["telegram", "system", "sos"]))
            .order_by(desc(Alert.created_at))
            .limit(limit)
        )
        alert_result = await db.execute(alert_q)
        for alert in alert_result.scalars().all():
            articles.append(_alert_to_article(alert))
    except Exception as e:
        logger.warning("Failed to fetch Alerts for news: %s", e)

    # Deduplicate by ID
    seen = set()
    unique = []
    for a in articles:
        if a["id"] not in seen:
            seen.add(a["id"])
            unique.append(a)
    articles = unique

    # Apply filters
    if category and category != "all":
        articles = [a for a in articles if a["category"] == category]
    if severity:
        articles = [a for a in articles if a["severity"] == severity]
    if source:
        articles = [a for a in articles if a["source_platform"] == source]

    # Sort by priority_score desc, then recency
    articles.sort(key=lambda a: (a["priority_score"], a["published_at"]), reverse=True)

    # Paginate
    total = len(articles)
    articles = articles[offset : offset + limit]

    return {"articles": articles, "total": total}


@router.get("/news/{article_id}")
async def get_news_article(
    article_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single news article by ID. Checks both GeoEvents and Alerts."""
    try:
        uid = UUID(article_id)
    except ValueError:
        return {"error": "Invalid article ID"}

    # Try GeoEvent first
    result = await db.execute(select(GeoEvent).where(GeoEvent.id == uid))
    event = result.scalar_one_or_none()
    if event:
        meta = event.metadata_ or {}
        channel_id = meta.get("channel", "")
        trust = 50.0
        try:
            ch_result = await db.execute(
                select(TelegramChannel.trust_score).where(TelegramChannel.channel_id == str(channel_id))
            )
            row = ch_result.first()
            if row:
                trust = (row[0] or 0.5) * 100
        except Exception:
            pass
        return _geo_event_to_article(event, trust)

    # Try Alert
    result = await db.execute(select(Alert).where(Alert.id == uid))
    alert = result.scalar_one_or_none()
    if alert:
        return _alert_to_article(alert)

    return {"error": "Article not found"}
