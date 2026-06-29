# TMT News Tab - Backend Implementation Plan (For Later)

## Overview

This plan covers the **backend implementation** for the News Tab feature, including database models, API endpoints, and AI agent integration. To be implemented after frontend is complete.

---

## Implementation Steps

| Step | Task | Status |
|------|------|--------|
| 1 | Create NewsArticle database model | ⬜ Pending |
| 2 | Create Pydantic schemas | ⬜ Pending |
| 3 | Create CRUD operations | ⬜ Pending |
| 4 | Create API routes | ⬜ Pending |
| 5 | Add WebSocket events | ⬜ Pending |
| 6 | Connect AI agent collectors | ⬜ Pending |
| 7 | Implement trust scoring algorithm | ⬜ Pending |

---

## Technical Specifications

### 1. Database Model

**File:** `backend/app/models/news.py`

```python
from sqlalchemy import Column, String, Text, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base_class import Base
import uuid
from datetime import datetime

class NewsArticle(Base):
    __tablename__ = "news_articles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Content
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=False)
    content = Column(Text)

    # Source
    source_platform = Column(String(50))  # twitter, telegram, facebook, etc.
    source_url = Column(String(1000))
    source_author = Column(String(200))
    original_post_id = Column(String(200))

    # Location (using PostGIS later for geospatial queries)
    latitude = Column(Float)
    longitude = Column(Float)
    location_name = Column(String(500))
    radius_km = Column(Float, default=10.0)

    # AI Scoring
    trust_score = Column(Float, default=50.0)       # 0-100
    priority_score = Column(Float, default=50.0)   # 0-100
    relevance_tags = Column(JSONB, default=list)   # ["medical", "security", "weather"]

    # Categorization
    category = Column(String(50))      # threat, update, warning, info
    severity = Column(String(20))      # critical, high, medium, low
    event_type = Column(String(50))    # flood, fire, conflict, medical, etc.

    # Metadata
    media_urls = Column(JSONB, default=list)       # Images, videos
    engagement_count = Column(Integer, default=0)  # Likes, shares, etc.
    verified = Column(Boolean, default=False)

    # Timestamps
    published_at = Column(DateTime)
    collected_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

    # Status
    is_active = Column(Boolean, default=True)
    is_false_report = Column(Boolean, default=False)
    false_report_count = Column(Integer, default=0)
```

### 2. Pydantic Schemas

**File:** `backend/app/schemas/news.py`

```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class NewsArticleBase(BaseModel):
    title: str
    summary: str
    content: Optional[str] = None
    source_platform: str
    source_url: Optional[str] = None
    source_author: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    trust_score: float = 50.0
    priority_score: float = 50.0
    relevance_tags: List[str] = []
    category: str
    severity: str
    event_type: Optional[str] = None
    media_urls: List[str] = []
    engagement_count: int = 0
    verified: bool = False
    published_at: Optional[datetime] = None

class NewsArticleCreate(NewsArticleBase):
    pass

class NewsArticleResponse(NewsArticleBase):
    id: UUID
    created_at: datetime
    distance_km: Optional[float] = None  # Calculated field

    class Config:
        from_attributes = True

class NewsListResponse(BaseModel):
    news: List[NewsArticleResponse]
    total: int
```

### 3. API Endpoints

**File:** `backend/app/api/routes/news.py`

```python
from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from uuid import UUID

router = APIRouter()

# GET /api/v1/news
# List news with filters
@router.get("/")
async def get_news(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: float = 50,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    source_platform: Optional[str] = None,
    min_trust_score: float = 0,
    search: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
):
    pass

# GET /api/v1/news/nearby
# Get news near a location (simplified endpoint)
@router.get("/nearby")
async def get_nearby_news(
    latitude: float,
    longitude: float,
    radius_km: float = 50,
    limit: int = 20,
):
    pass

# GET /api/v1/news/trending
# Get trending/high-engagement news
@router.get("/trending")
async def get_trending_news(
    hours: int = 24,
    limit: int = 10,
):
    pass

# GET /api/v1/news/{id}
# Get single news article
@router.get("/{news_id}")
async def get_news_by_id(news_id: UUID):
    pass

# PUT /api/v1/news/{id}/report-false
# Report as false/misleading
@router.put("/{news_id}/report-false")
async def report_false_news(news_id: UUID):
    pass
```

### 4. WebSocket Events

```python
# Real-time events for news updates

# Emit when new news is collected
await sio.emit("news_update", {
    "type": "new",
    "article": news_article_dict
})

# Emit when news is removed/expired
await sio.emit("news_removed", {
    "id": news_id
})

# Emit for breaking/critical news
await sio.emit("breaking_news", {
    "article": news_article_dict
})
```

### 5. AI Agent Integration

```python
# backend/app/services/ai_agent/news_collector.py

class NewsCollector:
    """
    Collects news from social media platforms
    """

    async def collect_from_twitter(self, keywords: List[str], location: tuple):
        """Collect tweets matching keywords near location"""
        pass

    async def collect_from_telegram(self, channels: List[str]):
        """Collect messages from monitored Telegram channels"""
        pass

    async def calculate_trust_score(self, article: dict) -> float:
        """
        Calculate trust score based on:
        - Source reputation
        - Engagement patterns
        - Cross-reference with other sources
        - Historical accuracy
        """
        pass

    async def calculate_priority_score(self, article: dict, user_location: tuple) -> float:
        """
        Calculate priority based on:
        - Severity
        - Distance from user
        - Recency
        - Trust score
        """
        pass
```

---

## Database Migration

```bash
# After creating the model, run:
alembic revision --autogenerate -m "Add news_articles table"
alembic upgrade head
```

---

## Notes

- Consider using PostGIS for efficient geospatial queries
- Implement caching for frequently accessed news
- Add rate limiting for report-false endpoint
- Consider news expiration/cleanup job
- Store original post IDs to prevent duplicates
