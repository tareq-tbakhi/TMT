# TMT: Crisis-Aware Routing, Offline Maps & Trusted News Sources

## Table of Contents

1. [Overview](#overview)
2. [Trusted News Sources Feature](#trusted-news-sources-feature)
3. [Crisis-Aware Routing System](#crisis-aware-routing-system)
4. [Offline Map Capability](#offline-map-capability)
5. [AI Integration](#ai-integration)
6. [Real-World Examples & Prior Art](#real-world-examples--prior-art)
7. [What We Can and Cannot Do](#what-we-can-and-cannot-do)
8. [Recommended Technology Stack](#recommended-technology-stack)
9. [Implementation Plan](#implementation-plan)
10. [Data Models & API Design](#data-models--api-design)
11. [Edge Cases & Failure Modes](#edge-cases--failure-modes)
12. [Architecture Diagrams](#architecture-diagrams)

---

## Overview

TMT currently shows maps via **React Leaflet + OpenStreetMap tiles** with straight-line routes between pickup and destination (no actual routing). Hospital directions are phone links (`tel:`). There is no offline map, no crisis-aware routing, and no mechanism for on-the-ground reporters to submit field intel that affects navigation.

This document designs three interconnected features:

1. **Trusted News Sources** — on-the-ground field reporters submit road closures, checkpoint status, hospital availability, and danger zones
2. **Crisis-Aware Routing** — directions that dynamically avoid obstacles reported by trusted sources
3. **Offline Maps** — map tiles + routing that work without internet (critical for Gaza/crisis zones)

All three features feed into each other: trusted reports create geographic obstacles, the routing engine avoids them, and all of it works offline.

---

## Trusted News Sources Feature

### Concept

Super admins can designate any patient user as a **Trusted News Source**. These users get an additional "Field Reports" tab where they can submit real-time intelligence about ground conditions. Reports include:

- Road closures / destruction
- Checkpoint status (open, closed, restricted)
- Hospital status (operational, overwhelmed, destroyed)
- Danger zones (active fighting, unexploded ordnance)
- Safe corridors confirmed
- Water/power outage areas
- Shelter availability

### How It Works

```
Super Admin marks user as trusted
          │
          ▼
User sees new "Field Reports" tab (mobile + web)
          │
          ▼
User submits report: natural language + optional photos + location
          │
          ▼
Backend AI processes report:
  - Extracts geographic entities (street names, landmarks)
  - Classifies report type (road_closure, checkpoint, hospital_status, danger_zone, etc.)
  - Geocodes mentioned locations to lat/lng
  - Assigns confidence score (weighted by trust_score of reporter)
  - Cross-references with other reports for corroboration
          │
          ▼
Creates GeoObstacle record with polygon/radius
          │
          ▼
Routing engine uses obstacles as exclusion zones
```

### Trust Model

The Patient model already has `trust_score` (0.0–1.0). We add:

| Field | Type | Description |
|-------|------|-------------|
| `User.is_trusted_source` | Boolean | Super admin toggle — enables field report submission |
| `User.trusted_source_since` | DateTime | When trust was granted |
| `User.trusted_source_revoked_at` | DateTime | When trust was revoked (null if active) |

Trust scoring for reports:

- **trust_score >= 0.8**: Report accepted immediately, high confidence
- **trust_score 0.5–0.8**: Report accepted with medium confidence, flagged for corroboration
- **trust_score < 0.5**: Report queued for manual review (trust earned back over time)
- **Corroboration**: When 2+ trusted sources report the same area, confidence increases to max
- **AI cross-reference**: AI checks if report aligns with Telegram intel, SOS patterns, satellite imagery mentions

### Field Report UI

**Mobile (Patient app)**:
- New tab "Reports" (visible only to users with `is_trusted_source = true`)
- Large text area for natural language input in Arabic/English
- Camera button for photo attachment (compressed, max 2MB)
- Auto-attached GPS location (current position)
- Optional: draw on map to mark affected area
- Submit button queues report (works offline via OfflineVault)

**Web (Admin dashboard)**:
- View all field reports on the map as markers/polygons
- Filter by type, confidence, reporter
- Manual override: admin can confirm/reject/modify report polygons
- Timeline view showing report evolution

### Report Data Model

```
FieldReport:
  id: UUID
  reporter_id: UUID (FK → users)
  report_type: enum (road_closure, checkpoint, hospital_status, danger_zone,
                     safe_corridor, infrastructure, shelter, other)
  content: text (natural language report)
  content_language: string ("ar", "en")
  photos: JSONB (array of S3/storage URLs)

  # Location
  location: Geometry(POINT)
  latitude: float
  longitude: float
  affected_area: Geometry(POLYGON)  # AI-generated or user-drawn
  radius_m: float  # If point-based, affected radius

  # AI processing
  ai_summary: text  # AI-generated English summary
  ai_extracted_entities: JSONB  # {"streets": [...], "landmarks": [...]}
  ai_classification: string  # Confirmed report_type
  ai_confidence: float (0.0–1.0)

  # Trust & verification
  reporter_trust_score: float  # Snapshot at submission time
  corroborated_by: JSONB  # [{"report_id": "...", "similarity": 0.9}]
  verification_status: enum (pending, verified, rejected, expired)
  verified_by: UUID (FK → users, admin who verified)

  # Routing impact
  creates_obstacle: boolean  # Whether this report generates a routing obstacle
  obstacle_id: UUID (FK → geo_obstacles)

  # Lifecycle
  expires_at: DateTime  # Auto-expire (default: 24h for closures, 6h for checkpoints)
  is_active: boolean
  created_at: DateTime
  updated_at: DateTime
```

### GeoObstacle Model (for routing)

```
GeoObstacle:
  id: UUID
  obstacle_type: enum (road_closure, checkpoint_closed, danger_zone,
                        hospital_down, safe_corridor, restricted_area)
  geometry: Geometry(POLYGON)  # Exclusion zone for routing
  severity: int (1–5)
  confidence: float (0.0–1.0)

  # Source tracking
  source_type: enum (field_report, telegram, system, admin_manual)
  source_reports: JSONB  # [report_id, report_id, ...]

  # Routing parameters
  is_hard_block: boolean  # true = absolute exclusion, false = heavy penalty
  penalty_factor: float  # For soft blocks: multiplier on edge cost (e.g., 10.0)

  # Lifecycle
  is_active: boolean
  created_at: DateTime
  expires_at: DateTime
  deactivated_at: DateTime
  deactivated_by: UUID
```

---

## Crisis-Aware Routing System

### Current State

The ambulance map (`pages/responder/ambulance/Map.tsx`) uses React Leaflet with a **straight-line polyline** between pickup and destination:

```typescript
// Line 103-104 in Map.tsx
// Simple straight line route (in production, use routing API)
const routeLine = destinationPos ? [pickupPos, destinationPos] : undefined;
```

This is unusable for real navigation. We need actual turn-by-turn routing that:
1. Follows real road geometry
2. Avoids obstacles from trusted reports
3. Works offline
4. Updates dynamically as new reports come in

### Why Not Google Maps

| Factor | Google Maps | Open-source (Valhalla/OSRM) |
|--------|-------------|---------------------------|
| **Cost** | $5–7 per 1,000 route requests | Free |
| **Offline** | No (requires internet) | Yes (full offline routing) |
| **Custom obstacles** | No (can't exclude arbitrary polygons) | Yes (`exclude_polygons` per query) |
| **Crisis zones** | May have outdated/censored data | OSM data updated by humanitarian mappers within hours |
| **Dependency** | Google can block API keys, impose quotas | Self-hosted, no external dependency |
| **Gaza coverage** | Limited street names, some areas blank | HOT (Humanitarian OpenStreetMap Team) has mapped 59,223 buildings, comprehensive road network |

**Verdict: Do not use Google Maps.** Use open-source routing with OpenStreetMap data.

### Recommended: Valhalla Routing Engine

**Why Valhalla over OSRM/GraphHopper:**

| Feature | Valhalla | OSRM | GraphHopper |
|---------|----------|------|-------------|
| Per-query polygon exclusion | **Yes** (`exclude_polygons`) | No (requires graph rebuild) | Partial (via custom models) |
| Dynamic costing | **Yes** (adjust penalties per request) | No (fixed profiles) | Yes |
| Offline mobile | **Yes** (C++ library, embeddable) | Difficult | Java, possible |
| Turn-by-turn narrative | **Yes** (with street names) | Basic | Yes |
| Time-distance matrices | **Yes** | Yes | Yes |
| License | MIT | BSD-2 | Apache (open-core) |
| Active maintenance | Mapbox team + community | Active | Commercial company |

**Key Valhalla feature for TMT**: The `exclude_polygons` parameter accepts GeoJSON polygons **per routing request**. This means we can dynamically exclude areas based on field reports without rebuilding the routing graph.

Example Valhalla request with obstacle avoidance:
```json
{
  "locations": [
    {"lat": 31.5, "lon": 34.46},
    {"lat": 31.52, "lon": 34.47}
  ],
  "costing": "auto",
  "exclude_polygons": [
    {
      "type": "Polygon",
      "coordinates": [[[34.461, 31.501], [34.463, 31.501], [34.463, 31.503], [34.461, 31.503], [34.461, 31.501]]]
    }
  ],
  "directions_options": {
    "language": "ar"
  }
}
```

### How Routing + Field Reports Connect

```
Field Report: "Salah al-Din street is blocked at km 5"
          │
          ▼
AI extracts location → geocodes → creates polygon
          │
          ▼
GeoObstacle saved: road_closure polygon around blocked segment
          │
          ▼
User requests route to hospital
          │
          ▼
Backend collects all active GeoObstacles near the route area
          │
          ▼
Valhalla request includes exclude_polygons = [all active hard-block obstacles]
  + penalty costs for soft-block obstacles (via costing_options)
          │
          ▼
Route returned avoids all known obstacles
          │
          ▼
Frontend renders route with obstacle markers shown on map
```

### Routing API Design

```
POST /api/v1/route
{
  "origin": {"lat": 31.5, "lon": 34.46},
  "destination": {"lat": 31.52, "lon": 34.47},
  "mode": "auto",  // "auto", "pedestrian", "bicycle"
  "avoid_obstacles": true,  // Include field report obstacles
  "obstacle_min_confidence": 0.5  // Only avoid obstacles above this confidence
}

Response:
{
  "route": {
    "geometry": "encoded_polyline...",
    "distance_km": 3.2,
    "duration_minutes": 12,
    "legs": [...],
    "maneuvers": [
      {"instruction": "Turn right onto Al-Rashid St", "distance": 0.5, ...}
    ]
  },
  "obstacles_avoided": [
    {"id": "...", "type": "road_closure", "description": "Salah al-Din blocked"}
  ],
  "alternative_routes": [...],
  "warnings": ["Route passes near active conflict zone (2km)"]
}
```

### Deployment Options for Valhalla

**Option A: Self-hosted Valhalla server (recommended for production)**
- Run Valhalla in Docker alongside our FastAPI backend
- Pre-build routing tiles from OSM PBF extract for Gaza/Palestine
- ~200MB–500MB RAM for Gaza-scale data
- Sub-second routing responses
- Can update OSM data periodically

**Option B: Valhalla embedded in mobile app (for offline)**
- Valhalla has a C++ core that can be compiled for Android/iOS
- Pre-built routing tiles bundled with the app (~50–100MB for Gaza)
- Full offline turn-by-turn routing
- More complex to build and maintain

**Option C: Hybrid (recommended)**
- Server-side Valhalla for online routing (with obstacle avoidance)
- Simplified offline routing for emergencies (pre-computed shortest paths to hospitals)
- App caches last-known routes for common destinations

### Map Display: MapLibre GL JS

Replace React Leaflet with **MapLibre GL JS** for:

| Feature | React Leaflet (current) | MapLibre GL JS |
|---------|------------------------|----------------|
| Rendering | Raster tiles (PNG) | Vector tiles (GPU-accelerated) |
| Offline tiles | Difficult (huge PNGs) | **PMTiles** (~50–150MB for Gaza) |
| Custom styling | Limited | Full style specification |
| Performance | Adequate | Much better (WebGL) |
| 3D terrain | No | Yes |
| Rotation/tilt | No | Yes |
| React wrapper | react-leaflet | react-map-gl or maplibre-react |

**Migration path**: MapLibre GL JS can use the same OpenStreetMap data. Existing marker/popup logic transfers. The main change is the rendering engine and tile format.

---

## Offline Map Capability

### The Problem

In Gaza/crisis zones, internet can be out for days or weeks. Map tiles loaded from `https://{s}.tile.openstreetmap.org/` won't work. Users need:

1. Map tiles visible without internet
2. Routing that works without internet
3. Field reports from before the outage still affecting routing

### Solution: PMTiles

**PMTiles** is a single-file archive format for map tiles. One `.pmtiles` file contains all vector tiles for a region.

| Aspect | Details |
|--------|---------|
| Format | Single binary file (cloud-optimized, HTTP range-request friendly) |
| Size for Gaza Strip | ~50–80MB (vector tiles, all zoom levels) |
| Size for all Palestine | ~100–150MB |
| Generation | `tippecanoe` tool converts GeoJSON/MBTiles → PMTiles |
| Source data | OpenStreetMap PBF extract from Geofabrik |
| Rendering | MapLibre GL JS reads PMTiles directly via `pmtiles` protocol |
| Storage on device | Capacitor Filesystem API or IndexedDB |
| Updates | Download new PMTiles file when internet available (delta updates possible) |

### How Offline Maps Work

```
FIRST INSTALL (online):
  1. App downloads Gaza PMTiles file (~60MB)
  2. Stored in device filesystem (Capacitor Filesystem plugin)
  3. Valhalla routing tiles also downloaded (~50MB)
  4. Total: ~110MB one-time download

OFFLINE USAGE:
  1. MapLibre reads tiles from local PMTiles file
  2. Routing uses local Valhalla tiles (if embedded) or cached routes
  3. Field reports from before offline are still in local obstacle cache
  4. New field reports submitted offline, stored in OfflineVault
  5. Map fully functional without internet

BACK ONLINE:
  1. SyncManager uploads queued field reports
  2. App checks for PMTiles updates (if OSM data changed)
  3. Downloads obstacle updates from server
  4. Routing now uses fresh obstacle data
```

### Offline Routing Strategy

**Full offline routing** (best but complex):
- Embed Valhalla C++ engine in mobile app via native module
- Pre-built routing tiles for Gaza bundled with app
- Full turn-by-turn routing offline
- Can apply obstacle exclusions locally
- Trade-off: adds ~15–20MB to app size, native build complexity

**Cached route fallback** (simpler):
- When online, pre-compute and cache routes to all hospitals from user's location
- Update cached routes daily or when obstacles change
- Offline: use cached route (may not reflect very recent changes)
- Show warning: "Route cached at [time] — obstacles may have changed"

**Recommended: Hybrid approach**
- Use server-side Valhalla when online (full obstacle avoidance)
- Cache computed routes for offline fallback
- Display obstacles on map even offline (from OfflineVault)
- Phase 2: Add embedded Valhalla for full offline routing

### Tile Management

```typescript
// Offline tile management pseudocode
class OfflineTileManager {
  // Check if offline tiles exist
  async hasOfflineTiles(): Promise<boolean>;

  // Download tiles for a region
  async downloadRegion(regionId: string): Promise<void>;
  // regionId: "gaza", "west_bank", "palestine_full"

  // Get tile source URL (local or remote)
  getTileSource(): string;
  // Returns "pmtiles:///local/path/gaza.pmtiles" if offline tiles exist
  // Returns "https://tiles.example.com/gaza.pmtiles" otherwise

  // Check for updates
  async checkForUpdates(): Promise<{available: boolean, sizeMB: number}>;

  // Get storage usage
  async getStorageUsage(): Promise<{usedMB: number, availableMB: number}>;
}
```

---

## AI Integration

### How AI Uses Trusted Reports

The TMT AI agent already processes Telegram intel and SOS data. Field reports from trusted sources integrate as follows:

**Trust weighting in AI analysis:**

```
Report confidence = base_confidence × reporter_trust_score × corroboration_factor

Where:
  base_confidence = AI's initial assessment of report plausibility (0.0–1.0)
  reporter_trust_score = Patient.trust_score (0.0–1.0)
  corroboration_factor = 1.0 + (0.3 × number_of_corroborating_reports), capped at 2.0
```

**AI tasks for field reports:**

1. **Entity extraction**: Parse natural language (Arabic/English) to extract:
   - Street names, landmarks, neighborhoods
   - Facility names (hospitals, schools, mosques)
   - Status descriptions → classify as report_type

2. **Geocoding**: Convert extracted entities to coordinates
   - Use Nominatim (OpenStreetMap geocoder) — free, no API key
   - Fall back to coordinate lookup tables for known Gaza landmarks

3. **Polygon generation**: Convert point reports to affected areas
   - Road closure: buffer the road segment by 50m
   - Danger zone: configurable radius (default 500m for active conflict, 200m for UXO)
   - Checkpoint: small polygon around the intersection

4. **Cross-reference**: Check report against:
   - Recent Telegram channel intel (existing TelegramChannel model with trust_score)
   - SOS patterns in the area (spike in SOS = something happening)
   - Other field reports (spatial + temporal clustering = corroboration)
   - Historical patterns (is this road frequently reported closed?)

5. **Expiration management**: Reports auto-expire based on type:
   - Checkpoint status: 6 hours (frequently changes)
   - Road closure: 24 hours (re-report to extend)
   - Hospital status: 12 hours
   - Danger zone: 48 hours (may persist)
   - Safe corridor: 4 hours (can close quickly)

### AI-Generated Routing Advice

When computing a route, the AI can attach contextual warnings:

```
"Your route passes 800m from Al-Shifa hospital (reported overwhelmed 3h ago
by 2 trusted sources). Consider Al-Aqsa Martyrs Hospital instead (1.2km
further but reported operational)."
```

This combines:
- Spatial proximity to obstacles
- Report freshness and confidence
- Alternative suggestions based on facility status

---

## Real-World Examples & Prior Art

### 1. Doroob Navigator (Palestine)

| Aspect | Details |
|--------|---------|
| **What** | Navigation app specifically for Palestine |
| **Users** | 200,000+ downloads |
| **Key feature** | Checkpoint awareness — routes avoid closed/military checkpoints |
| **How** | Community-reported checkpoint data + dedicated monitoring team |
| **Data source** | User reports + field monitors + social media aggregation |
| **Routing** | OpenStreetMap-based with custom checkpoint layer |
| **Offline** | Yes — downloadable offline maps for West Bank/Gaza |
| **Relevance to TMT** | Direct precedent for checkpoint-aware routing in Palestine. Proves the concept works at scale. |

**What we can learn**: Doroob proves that community-sourced obstacle data + routing avoidance works in Palestine specifically. Their checkpoint monitoring model is directly applicable.

### 2. Azmeh App (Palestine)

| Aspect | Details |
|--------|---------|
| **What** | Real-time checkpoint and road status app |
| **Users** | Active community of reporters |
| **Key feature** | 800+ checkpoints tracked with real-time status |
| **How** | Crowdsourced reports with verification layer |
| **Relevance** | Data source — we could potentially integrate or learn from their data model |

**What we can learn**: Their checkpoint database structure and status classification system is battle-tested. We should use similar categories.

### 3. Ushahidi Platform (Global)

| Aspect | Details |
|--------|---------|
| **What** | Open-source crisis mapping platform |
| **Used in** | Haiti earthquake (2010), Libya (2011), Syria, Ukraine, dozens of crises |
| **Key feature** | Crowdsourced crisis reports plotted on maps, verified by moderators |
| **How** | SMS + web + social media → map + timeline |
| **Relevance** | Their report verification workflow (submit → review → verify → publish) is exactly what we need |

**What we can learn**: Ushahidi's moderation workflow handles the trust problem: unverified reports shown differently from verified ones. Their category taxonomy for crisis events is well-tested.

### 4. Waze (Global, commercial)

| Aspect | Details |
|--------|---------|
| **What** | Community-driven navigation |
| **Key feature** | Real-time user reports (police, hazards, road closures) affect routing |
| **How** | Massive user base reports in real-time; routing engine incorporates reports as edge penalties |
| **Relevance** | Proves that community reports can dynamically affect routing at massive scale |

**What we can learn**: Waze's approach of treating reports as edge-cost penalties (not hard blocks) is more robust. A single false report doesn't completely block a road — it just adds cost, making the router prefer alternatives.

### 5. HOT (Humanitarian OpenStreetMap Team)

| Aspect | Details |
|--------|---------|
| **What** | Volunteer mapping for humanitarian response |
| **Gaza mapping** | 59,223 buildings mapped, comprehensive road network |
| **How** | Remote volunteers trace satellite imagery; local mappers add ground truth |
| **Relevance** | The underlying map data for Gaza is high quality thanks to HOT |

**What we can learn**: We have excellent base map data. Gaza's OSM coverage is better than many commercial map providers because of dedicated humanitarian mapping efforts.

### 6. OCHA (UN) ReliefWeb / HDX

| Aspect | Details |
|--------|---------|
| **What** | UN humanitarian data exchange |
| **Relevance** | Publishes GIS datasets: damage assessments, road accessibility, facility status |
| **Data format** | GeoJSON, Shapefiles — directly importable as GeoObstacles |

**What we can learn**: We can potentially ingest OCHA/HDX datasets as additional obstacle/facility sources alongside trusted reporter data.

---

## What We Can and Cannot Do

### Definitely Can Do

| Feature | Feasibility | Notes |
|---------|-------------|-------|
| Replace Google Maps with MapLibre GL | **Easy** | Drop-in replacement, better in every way |
| Offline map tiles (PMTiles) | **Easy** | ~60MB download, works perfectly offline |
| Trusted source designation by super admin | **Easy** | Add boolean field to User model, check in frontend |
| Field report submission UI | **Medium** | Text + photo + GPS, standard mobile form |
| Server-side Valhalla routing | **Medium** | Docker container, well-documented setup |
| Obstacle-aware routing (online) | **Medium** | Valhalla's `exclude_polygons` handles this natively |
| Field report → obstacle conversion | **Medium** | AI extracts location, creates polygon |
| Report expiration/lifecycle | **Easy** | Cron job or DB trigger |
| Arabic language routing directions | **Easy** | Valhalla supports Arabic natively |
| Offline field report submission | **Already done** | OfflineVault + SyncManager already handle this |

### Can Do With Effort

| Feature | Feasibility | Notes |
|---------|-------------|-------|
| Full offline routing (embedded Valhalla) | **Hard** | Requires compiling C++ for Android/iOS, ~50MB tiles |
| AI entity extraction from Arabic text | **Medium-Hard** | Need good Arabic NLP; can use Claude API |
| Photo analysis for damage assessment | **Medium** | Claude vision API can classify damage photos |
| Real-time obstacle updates via WebSocket | **Medium** | Already have WebSocket infra for SOS |
| Cached route precomputation | **Medium** | Compute routes to top N hospitals, cache on device |

### Cannot Do (Inherent Limitations)

| Feature | Why Not | Mitigation |
|---------|---------|-----------|
| 100% accurate routing in active war zone | Roads destroyed/blocked without warning; no data source is real-time enough | Show "route may be inaccurate" warning; encourage frequent field reports |
| Routing through areas with no OSM data | Some informal roads/paths not in OSM | Encourage local community to contribute to OSM; accept user-drawn routes |
| Satellite imagery analysis | Requires expensive satellite feeds + specialized ML | Use OCHA/UNOSAT published damage assessments instead |
| Guaranteed offline tile freshness | Tiles may be months old if user doesn't update | Show tile date; prompt update when online |
| Cross-border routing (Gaza ↔ Egypt/Israel) | Border crossings have unpredictable restrictions | Show border crossing as a special obstacle type with "check status" note |

---

## Recommended Technology Stack

### Map Rendering

| Component | Technology | Why |
|-----------|-----------|-----|
| Map library | **MapLibre GL JS** (via `react-map-gl`) | Free Mapbox fork, vector tiles, offline PMTiles support, WebGL rendering |
| Tile format | **PMTiles** (vector) | Single file, offline-friendly, ~60MB for Gaza |
| Tile generation | **tippecanoe** + **tilemaker** | Convert OSM PBF → MBTiles → PMTiles |
| Tile source | **OpenStreetMap** (Geofabrik extract) | Best Gaza coverage, free, humanitarian mappers active |
| Style | **MapTiler Basic** or custom | Free style, Arabic labels available |

### Routing

| Component | Technology | Why |
|-----------|-----------|-----|
| Routing engine | **Valhalla** | Per-query `exclude_polygons`, dynamic costing, Arabic directions, MIT license |
| Deployment | **Docker** (alongside FastAPI) | `ghcr.io/valhalla/valhalla:latest` |
| Routing data | **OSM PBF** (same as tiles) | Valhalla builds its own graph from PBF |
| Offline routing | **Cached routes** (Phase 1) → **Embedded Valhalla** (Phase 2) | Progressive enhancement |

### Field Reports

| Component | Technology | Why |
|-----------|-----------|-----|
| Text processing | **Claude API** | Arabic + English NLP, entity extraction, classification |
| Geocoding | **Nominatim** (self-hosted or Photon) | Free, OSM-based, good for local place names |
| Photo storage | **S3-compatible** (MinIO or cloud S3) | Standard, works with existing infra |
| Photo analysis | **Claude Vision API** | Damage classification from photos |

### Frontend

| Component | Technology | Why |
|-----------|-----------|-----|
| Map component | **react-map-gl** + **maplibre-gl** | React wrapper for MapLibre, familiar patterns |
| Offline tiles | **pmtiles** npm package | Reads PMTiles from local storage |
| Local storage | **OfflineVault** (existing) | Already built, AES-256-GCM encrypted |

---

## Implementation Plan

### Phase 1: Trusted Sources + Field Reports (Backend + Basic UI)

**Scope**: User model changes, field report API, basic submission UI

1. Add `is_trusted_source`, `trusted_source_since` columns to User model
2. Create `FieldReport` model and migration
3. Create `GeoObstacle` model and migration
4. API endpoints:
   - `POST /api/v1/admin/users/{id}/trust` — toggle trusted source status
   - `POST /api/v1/reports` — submit field report
   - `GET /api/v1/reports` — list reports (with filters)
   - `GET /api/v1/reports/nearby?lat=...&lon=...&radius=...` — nearby reports
   - `GET /api/v1/obstacles/active` — all active obstacles for routing
   - `PATCH /api/v1/reports/{id}/verify` — admin verify/reject
5. Frontend: "Field Reports" tab for trusted users (mobile)
6. Frontend: Report submission form (text + photo + location)
7. Admin dashboard: View/verify reports on map

### Phase 2: Replace Map Engine (MapLibre + Offline Tiles)

**Scope**: Replace React Leaflet with MapLibre GL JS, add offline PMTiles

1. Install `maplibre-gl`, `react-map-gl`, `pmtiles`
2. Create `MapProvider` component wrapping MapLibre GL
3. Generate Gaza PMTiles from OSM extract
4. Implement `OfflineTileManager` for download/storage
5. Migrate ambulance Map.tsx from React Leaflet to MapLibre
6. Migrate all other map views (police, civil defense, firefighter)
7. Add obstacle visualization layer (red polygons for closures, yellow for danger, etc.)
8. Test offline tile rendering

### Phase 3: Crisis-Aware Routing (Valhalla)

**Scope**: Server-side Valhalla, obstacle-aware routing

1. Deploy Valhalla Docker container with Gaza OSM data
2. Create routing proxy endpoint: `POST /api/v1/route`
3. Routing endpoint collects active GeoObstacles, passes as `exclude_polygons`
4. Frontend: Replace straight-line routes with Valhalla-computed routes
5. Frontend: Show turn-by-turn directions
6. Frontend: Display avoided obstacles on route
7. Cache computed routes for offline use

### Phase 4: AI Processing of Reports

**Scope**: Automated report analysis, obstacle generation

1. AI pipeline: report text → entity extraction → geocoding → polygon generation
2. Cross-reference reports with Telegram intel
3. Corroboration detection (multiple reports about same area)
4. Auto-expire obstacles based on type
5. Confidence scoring

### Phase 5: Full Offline Routing (Future)

**Scope**: Embedded Valhalla for complete offline routing

1. Compile Valhalla C++ for Android (NDK) and iOS
2. Create Capacitor plugin wrapping native Valhalla
3. Bundle routing tiles with app
4. Offline obstacle exclusion using local GeoObstacle cache
5. Sync obstacle updates when online

---

## Data Models & API Design

### Complete API Endpoints

```
# Trusted Sources
POST   /api/v1/admin/users/{id}/trust          # Grant/revoke trusted source
GET    /api/v1/admin/trusted-sources            # List all trusted sources

# Field Reports
POST   /api/v1/reports                          # Submit report
GET    /api/v1/reports                          # List reports (paginated, filterable)
GET    /api/v1/reports/{id}                     # Get single report
GET    /api/v1/reports/nearby                   # Reports near a location
PATCH  /api/v1/reports/{id}/verify              # Admin verify/reject
DELETE /api/v1/reports/{id}                     # Admin delete

# Obstacles (for routing)
GET    /api/v1/obstacles/active                 # All active obstacles
GET    /api/v1/obstacles/bbox                   # Obstacles in bounding box
POST   /api/v1/obstacles                        # Admin create manual obstacle
PATCH  /api/v1/obstacles/{id}                   # Admin modify obstacle
DELETE /api/v1/obstacles/{id}                   # Admin deactivate obstacle

# Routing
POST   /api/v1/route                            # Get crisis-aware route
POST   /api/v1/route/matrix                     # Distance matrix (multiple hospitals)
GET    /api/v1/route/hospitals-near              # Nearest reachable hospitals

# Offline Tiles
GET    /api/v1/tiles/info                       # Available tile packages
GET    /api/v1/tiles/{region}.pmtiles           # Download tile package
GET    /api/v1/tiles/{region}/version           # Check for updates
```

### Database Migration Summary

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN is_trusted_source BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN trusted_source_since TIMESTAMP;
ALTER TABLE users ADD COLUMN trusted_source_revoked_at TIMESTAMP;

-- New: field_reports table
CREATE TABLE field_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    report_type VARCHAR NOT NULL,
    content TEXT NOT NULL,
    content_language VARCHAR DEFAULT 'ar',
    photos JSONB DEFAULT '[]',
    location GEOMETRY(POINT, 4326),
    latitude FLOAT,
    longitude FLOAT,
    affected_area GEOMETRY(POLYGON, 4326),
    radius_m FLOAT DEFAULT 200,
    ai_summary TEXT,
    ai_extracted_entities JSONB DEFAULT '{}',
    ai_classification VARCHAR,
    ai_confidence FLOAT DEFAULT 0.5,
    reporter_trust_score FLOAT,
    corroborated_by JSONB DEFAULT '[]',
    verification_status VARCHAR DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    creates_obstacle BOOLEAN DEFAULT FALSE,
    obstacle_id UUID,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- New: geo_obstacles table
CREATE TABLE geo_obstacles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obstacle_type VARCHAR NOT NULL,
    geometry GEOMETRY(POLYGON, 4326) NOT NULL,
    severity INT DEFAULT 3,
    confidence FLOAT DEFAULT 0.5,
    source_type VARCHAR NOT NULL,
    source_reports JSONB DEFAULT '[]',
    is_hard_block BOOLEAN DEFAULT TRUE,
    penalty_factor FLOAT DEFAULT 10.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    deactivated_at TIMESTAMP,
    deactivated_by UUID REFERENCES users(id)
);

-- Spatial indexes
CREATE INDEX idx_field_reports_location ON field_reports USING GIST(location);
CREATE INDEX idx_geo_obstacles_geometry ON geo_obstacles USING GIST(geometry);
CREATE INDEX idx_field_reports_active ON field_reports(is_active, verification_status);
CREATE INDEX idx_geo_obstacles_active ON geo_obstacles(is_active, expires_at);
```

---

## Edge Cases & Failure Modes

### Field Reports

| Edge Case | How We Handle It |
|-----------|-----------------|
| False/malicious report from trusted source | Trust score decreases over time if reports aren't corroborated. Admin can revoke trust immediately. Soft blocks (penalties) preferred over hard blocks. |
| Same obstacle reported by 10 people | Dedup by spatial clustering — reports within 200m of each other about the same type merge into one obstacle with higher confidence. |
| Report in language AI can't parse | Store raw text, flag for manual review. Admin can manually create obstacle. |
| Photo without text | Claude Vision analyzes photo, attempts to classify. Location from GPS metadata. |
| GPS spoofed location | Cross-reference with user's historical locations. Flag if report location is > 50km from last known position. |
| Report expires but obstacle persists | Users can "confirm still active" to extend expiration. AI checks SOS patterns in area. |
| Conflicting reports (one says open, one says closed) | Show both to admin. Use most recent trusted report. AI flags conflict for review. |

### Routing

| Edge Case | How We Handle It |
|-----------|-----------------|
| All routes to hospital are blocked | Show warning: "No safe route found to [hospital]. Alternatives: [list other hospitals with routes]" |
| Obstacle added while user is navigating | WebSocket push notification → re-route automatically → alert user "Route updated: avoiding new obstacle" |
| Valhalla server is down | Fall back to cached routes. If no cache, fall back to straight-line with warning. |
| User is offline and cached route is stale | Show route with warning: "Cached route from [time]. Local conditions may have changed." |
| Route goes through area with expired obstacle | Still avoid recently-expired obstacles for 1 hour with reduced penalty (grace period). |

### Offline

| Edge Case | How We Handle It |
|-----------|-----------------|
| PMTiles file corrupted on device | Verify checksum on download. Fall back to online tiles if available. Re-download option. |
| Device storage full | Show storage usage, let user choose which regions to keep. Minimum: just the user's current city. |
| Tiles months out of date | Show tile date on map. Prompt update when online. New buildings/roads won't show but routing still works. |
| User moves to area outside downloaded tiles | Show blank map with marker. Prompt download of new region. GPS and routing still work — just no visual map. |

---

## Architecture Diagrams

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TMT Mobile App                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Field Report │  │  MapLibre GL │  │  Route Display       │  │
│  │  Submission   │  │  + PMTiles   │  │  + Turn-by-turn      │  │
│  │  (Trusted)    │  │  (Offline)   │  │  + Obstacle markers  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐  │
│  │                    OfflineVault (AES-256-GCM)             │  │
│  │  pending_reports │ cached_routes │ cached_obstacles │ ...  │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │ SyncManager                       │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                     ─────────┼─────────  (Internet / SMS / Mesh)
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                      TMT Backend                                │
│                             │                                   │
│  ┌──────────────┐  ┌───────┴──────┐  ┌───────────────────────┐ │
│  │  Report API   │  │  Route API   │  │  Obstacle API         │ │
│  │  /reports     │  │  /route      │  │  /obstacles           │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                       │             │
│  ┌──────┴─────────┐  ┌───┴───────────┐  ┌───────┴───────────┐ │
│  │  AI Pipeline    │  │  Valhalla     │  │  PostgreSQL +     │ │
│  │  (Claude API)   │  │  (Docker)     │  │  PostGIS          │ │
│  │  NLP + Geocode  │  │  Routing      │  │  Reports, Obst.   │ │
│  └────────────────┘  └───────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Field Report Flow

```
Trusted User                    Backend                         Routing
    │                              │                              │
    │  Submit report (text+photo)  │                              │
    ├─────────────────────────────►│                              │
    │                              │  AI: extract entities        │
    │                              │  AI: classify type           │
    │                              │  AI: geocode locations       │
    │                              │  AI: generate polygon        │
    │                              │  AI: score confidence        │
    │                              │                              │
    │                              │  if confidence > 0.5:        │
    │                              │    create GeoObstacle        │
    │                              │──────────────────────────────►│
    │                              │                              │
    │                              │  Broadcast to connected      │
    │                              │  users via WebSocket         │
    │   ◄─ WS: new obstacle ──────│                              │
    │                              │                              │
    │                              │         User requests route  │
    │                              │◄─────────────────────────────│
    │                              │  Collect active obstacles    │
    │                              │  Send to Valhalla with       │
    │                              │    exclude_polygons          │
    │                              │  Return crisis-aware route   │
    │                              │─────────────────────────────►│
```

### Offline Sequence

```
[ONLINE - Preparation]
  1. Download PMTiles (map) ─────────────────► Device Storage
  2. Pre-compute routes to hospitals ────────► OfflineVault.cached_routes
  3. Cache active obstacles ─────────────────► OfflineVault.cached_obstacles

[OFFLINE - Operation]
  1. MapLibre reads tiles from ──────────────► Local PMTiles file
  2. User requests route ────────────────────► Return cached route + warning
  3. Show obstacles from ────────────────────► OfflineVault.cached_obstacles
  4. User submits field report ──────────────► OfflineVault.pending_reports
  5. Locally generated obstacles ────────────► Applied to cached routes

[BACK ONLINE - Sync]
  1. SyncManager uploads pending reports ────► Backend processes, creates obstacles
  2. Fetch fresh obstacles ──────────────────► Update OfflineVault.cached_obstacles
  3. Re-route with fresh data ───────────────► Update displayed routes
  4. Check for tile updates ─────────────────► Download if newer version available
```

---

## Summary

| Question | Answer |
|----------|--------|
| Can we do crisis-aware routing? | **Yes** — Valhalla with `exclude_polygons` from field reports |
| Can it work offline? | **Yes** — PMTiles for map, cached routes for navigation, OfflineVault for data |
| Should we use Google Maps? | **No** — open-source is free, offline-capable, customizable, and has better Gaza coverage |
| Is there real-world precedent? | **Yes** — Doroob Navigator (200K+ users in Palestine), Azmeh (800+ checkpoints), Ushahidi (used in dozens of crises) |
| Can trusted sources affect routing? | **Yes** — reports → AI processing → GeoObstacles → Valhalla exclude_polygons |
| What about Arabic support? | **Yes** — Valhalla supports Arabic turn-by-turn directions, MapLibre supports Arabic labels |
| What's the offline map size? | **~60–150MB** for Gaza/Palestine (vector tiles + routing data) |
| Can we add photos to reports? | **Yes** — upload to S3, Claude Vision can analyze damage |
| How long to implement? | Phase 1 (reports): ~1 week. Phase 2 (map): ~1 week. Phase 3 (routing): ~1 week. Phase 4 (AI): ~1 week. Phase 5 (full offline routing): ~2 weeks |
