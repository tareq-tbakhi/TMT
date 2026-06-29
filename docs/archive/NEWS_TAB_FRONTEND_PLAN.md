# TMT News Tab - Frontend Implementation Plan

## Overview

The News Tab is a location-aware, AI-curated news feed that displays threat intelligence from social media platforms. This plan covers the **frontend implementation only** using dummy data, ready to connect to the backend API later.

---

## Feature Summary

| Aspect | Description |
|--------|-------------|
| **Purpose** | Display AI-curated news from social media sources |
| **Data Source** | Dummy data (backend API integration later) |
| **Prioritization** | AI trust score (0-100) based on source reliability |
| **Location Filtering** | Shows news within configurable radius of user |
| **Target Users** | Patients (primary), Hospital admins (later) |

---

## Implementation Steps

| Step | Task | Status |
|------|------|--------|
| 1 | Create TypeScript types & interfaces | ⬜ Pending |
| 2 | Create dummy data with realistic samples | ⬜ Pending |
| 3 | Create Zustand store for state management | ⬜ Pending |
| 4 | Create UI components | ⬜ Pending |
| 5 | Create News page for patient interface | ⬜ Pending |
| 6 | Add News tab to PatientLayout navigation | ⬜ Pending |

---

## Technical Specifications

### 1. TypeScript Interfaces

**File:** `frontend/src/types/newsTypes.ts`

```typescript
export interface NewsArticle {
  id: string;

  // Content
  title: string;
  summary: string;
  content?: string;

  // Source
  source_platform: 'twitter' | 'telegram' | 'facebook' | 'instagram' | 'other';
  source_url?: string;
  source_author?: string;

  // Location
  latitude?: number;
  longitude?: number;
  location_name?: string;
  distance_km?: number;

  // AI Scoring
  trust_score: number;      // 0-100
  priority_score: number;   // 0-100
  relevance_tags: string[];

  // Categorization
  category: 'threat' | 'update' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  event_type?: string;

  // Media
  media_urls?: string[];

  // Metadata
  engagement_count: number;
  verified: boolean;

  // Timestamps
  published_at: string;
  created_at: string;
}

export interface NewsFilters {
  category?: string;
  severity?: string;
  source_platform?: string;
  min_trust_score?: number;
  radius_km?: number;
  search?: string;
}
```

### 2. Component Structure

```
frontend/src/components/news/
├── TrustScoreBadge.tsx   # Visual trust indicator (colored badge)
├── SourceBadge.tsx       # Platform icon + author
├── NewsCard.tsx          # Individual news item card
├── NewsFilters.tsx       # Search bar + filter chips
├── NewsList.tsx          # Scrollable news list
├── NewsDetail.tsx        # Full article modal/sheet
└── index.ts              # Exports
```

### 3. UI Design

#### NewsCard Layout
```
┌─────────────────────────────────────────────┐
│ [🐦 Twitter] @author_name     [Trust: 85] ✓ │
├─────────────────────────────────────────────┤
│ News Title Goes Here                        │
│                                             │
│ Summary text that provides context about    │
│ the news article...                         │
│                                             │
│ [🏥 Medical] [⚠️ High]           📍 2.5 km │
│ 2 hours ago              👁️ 1.2k views     │
└─────────────────────────────────────────────┘
```

#### Trust Score Color Coding
| Score | Color | Label |
|-------|-------|-------|
| 80-100 | `bg-green-100 text-green-700` | Highly Trusted |
| 60-79 | `bg-blue-100 text-blue-700` | Trusted |
| 40-59 | `bg-amber-100 text-amber-700` | Moderate |
| 20-39 | `bg-orange-100 text-orange-700` | Low Trust |
| 0-19 | `bg-red-100 text-red-700` | Unverified |

#### Severity Indicators
| Severity | Color |
|----------|-------|
| Critical | `bg-red-600` |
| High | `bg-orange-500` |
| Medium | `bg-yellow-500` |
| Low | `bg-blue-400` |

#### Category Icons
| Category | Icon |
|----------|------|
| threat | ⚠️ |
| warning | 🚨 |
| update | 📢 |
| info | ℹ️ |

#### Source Platform Icons
| Platform | Icon |
|----------|------|
| twitter | 🐦 |
| telegram | ✈️ |
| facebook | 📘 |
| instagram | 📷 |
| other | 🌐 |

---

## Dummy Data Examples

```typescript
// Sample news articles for testing
const dummyNews: NewsArticle[] = [
  {
    id: "1",
    title: "Heavy flooding reported in downtown area",
    summary: "Multiple streets flooded due to heavy rainfall. Emergency services advise avoiding the area.",
    source_platform: "twitter",
    source_author: "CityEmergency",
    location_name: "Downtown District",
    latitude: 31.5,
    longitude: 34.4,
    distance_km: 2.5,
    trust_score: 92,
    priority_score: 85,
    relevance_tags: ["flood", "emergency", "weather"],
    category: "warning",
    severity: "high",
    event_type: "flood",
    engagement_count: 1250,
    verified: true,
    published_at: "2024-01-15T10:30:00Z",
    created_at: "2024-01-15T10:32:00Z"
  },
  // ... more samples
];
```

---

## Page Layout

### News Page Structure
```
┌─────────────────────────────────────────────┐
│ [Header: "Nearby News" + Location indicator]│
├─────────────────────────────────────────────┤
│ [🔍 Search...] [Filters ▼]                  │
├─────────────────────────────────────────────┤
│ [All] [Threats] [Warnings] [Updates] [Info] │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ NewsCard 1                              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ NewsCard 2                              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ NewsCard 3                              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Load More / Infinite Scroll]               │
└─────────────────────────────────────────────┘
```

---

## Notes

- Follow existing app theme (Tailwind, gray backgrounds, blue accents)
- Mobile-first design (this is primarily for patient app)
- Cards should be tappable to open detail view
- Implement pull-to-refresh gesture
- Show "No news in your area" empty state
- Loading skeleton while fetching
- Ready to connect to real API later (just swap dummy data with API calls)
