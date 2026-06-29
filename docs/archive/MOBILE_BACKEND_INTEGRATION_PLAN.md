# TMT Mobile App - Backend Integration Plan

## Executive Summary

This document provides a comprehensive, professional-grade integration plan for connecting the TMT mobile app to the backend API. It follows SOLID principles, clean architecture patterns, and industry best practices.

**Current State:**
- Mobile app: Uses demo/dummy data in stores
- Dashboard: Fully connected to backend API
- Backend: 40+ API endpoints, WebSocket support, AI triage pipeline

**Goal:**
- Full mobile-backend integration with real-time sync, offline support, and production-ready error handling

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Feature Integration Matrix](#2-feature-integration-matrix)
3. [Phase 1: Core Infrastructure](#phase-1-core-infrastructure)
4. [Phase 2: Authentication & User Management](#phase-2-authentication--user-management)
5. [Phase 3: SOS & Emergency Features](#phase-3-sos--emergency-features)
6. [Phase 4: Real-time Features](#phase-4-real-time-features)
7. [Phase 5: Field Responder Integration](#phase-5-field-responder-integration)
8. [Phase 6: News & Alerts](#phase-6-news--alerts)
9. [Phase 7: Offline Support](#phase-7-offline-support)
10. [Phase 8: Testing & Quality Assurance](#phase-8-testing--quality-assurance)
11. [Not Yet Implemented Features](#not-yet-implemented-features)
12. [API Endpoint Reference](#api-endpoint-reference)
13. [Data Flow Diagrams](#data-flow-diagrams)
14. [Security Considerations](#security-considerations)

---

## 1. Architecture Overview

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TMT Mobile App                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Patient   │  │  Responder  │  │  Dashboard  │  │   Admin     │ │
│  │    Views    │  │    Views    │  │    Views    │  │   Views     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │        │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐ │
│  │                     Zustand Stores                              │ │
│  │  authStore │ sosStore │ alertStore │ mapStore │ responderStore │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                     Service Layer                                │ │
│  │  api.ts │ mapService.ts │ smsService.ts │ socketService.ts      │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                   Native Services Layer                          │ │
│  │  geolocation │ camera │ push │ storage │ network │ haptics      │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      Network Layer         │
                    │  HTTP REST │ WebSocket     │
                    │  SMS (Twilio) │ SSE        │
                    └─────────────┬─────────────┘
                                  │
┌─────────────────────────────────┼────────────────────────────────────┐
│                         TMT Backend                                   │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                      FastAPI Router                              │ │
│  │  /auth │ /patients │ /sos │ /alerts │ /hospitals │ /map │ /sms  │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                     Service Layer                                │ │
│  │  PatientService │ SOSService │ AlertService │ AnalyticsService  │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                   AI Agent Pipeline                              │ │
│  │  Triage Agent │ Dispatcher │ Risk Scorer │ Priority Analyzer    │ │
│  └──────────────────────────────┬──────────────────────────────────┘ │
│                                 │                                    │
│  ┌──────────────────────────────┴──────────────────────────────────┐ │
│  │                    Data Layer                                    │ │
│  │  PostgreSQL + PostGIS │ Redis │ Celery │ Socket.IO              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each service handles one domain (auth, sos, alerts) |
| **Open/Closed** | Services extend via interfaces, not modifications |
| **Liskov Substitution** | Native/Web implementations interchangeable |
| **Interface Segregation** | Small, focused interfaces per feature |
| **Dependency Inversion** | Stores depend on abstractions, not concretions |

### 1.3 Data Flow Pattern

```
User Action → Component → Store Action → Service Call → API Request
                                              ↓
                                         Response
                                              ↓
User Action ← Component ← Store Update ← Service Parse ←┘
```

---

## 2. Feature Integration Matrix

### 2.1 Mobile App Features vs Backend Status

| Feature | Mobile UI | Backend API | Integration Status |
|---------|-----------|-------------|-------------------|
| **Authentication** | | | |
| Patient Login | ✅ Complete | ✅ `/auth/login` | 🔄 Needs Integration |
| Responder Login | ✅ Complete | ✅ `/auth/login` | 🔄 Needs Integration |
| Patient Registration | ✅ Complete | ✅ `/patients` POST | 🔄 Needs Integration |
| Token Management | ✅ localStorage | ✅ JWT | 🔄 Needs Integration |
| **Patient Features** | | | |
| SOS Trigger | ✅ AI Assistant | ✅ `/sos` POST | 🔄 Needs Integration |
| SOS Countdown | ✅ 5-second cancel | ✅ Supported | ✅ Frontend-only |
| AI Triage Conversation | ✅ Full flow | ✅ Triage Pipeline | 🔄 Needs Integration |
| Voice Input | ✅ Web Speech API | N/A | ✅ Frontend-only |
| Photo Capture | ✅ Camera service | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Offline SMS SOS | ✅ Encrypted SMS | ✅ `/sms/inbound` | 🔄 Needs Integration |
| View Profile | ✅ Profile page | ✅ `/patients/{id}` | 🔄 Needs Integration |
| Update Profile | ✅ Edit form | ✅ `/patients/{id}` PUT | 🔄 Needs Integration |
| Medical Records | ✅ View page | ✅ `/patients/{id}/records` | 🔄 Needs Integration |
| Location Update | ✅ GPS tracking | ✅ `/patients/{id}/location` | 🔄 Needs Integration |
| Nearest Hospital | ✅ Display | ✅ `/patients/{id}/nearest-hospital` | 🔄 Needs Integration |
| **News Features** | | | |
| News Feed | ✅ Full UI | ⚠️ No `/news` endpoint | ❌ NOT IMPLEMENTED |
| News Filtering | ✅ By category/trust | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Trust Score Display | ✅ Badges | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| **Alert Features** | | | |
| View Alerts | ✅ Alert page | ✅ `/alerts` GET | 🔄 Needs Integration |
| Alert Notifications | ✅ Push service | ✅ WebSocket | 🔄 Needs Integration |
| **Map Features** | | | |
| Live Map | ✅ Multi-layer | ✅ `/map/events` | 🔄 Needs Integration |
| Real-time Events | ✅ WebSocket hook | ✅ Socket.IO | 🔄 Needs Integration |
| Layer Toggle | ✅ 9 layers | ✅ `/map/layers` | 🔄 Needs Integration |
| **Responder Features** | | | |
| Active Case View | ✅ Full UI | ⚠️ No dispatch endpoint | ❌ NOT IMPLEMENTED |
| Case Status Updates | ✅ Status buttons | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Equipment Checklist | ✅ Checkbox UI | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Case History | ✅ History page | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Duty Status Toggle | ✅ Toggle UI | ⚠️ No endpoint | ❌ NOT IMPLEMENTED |
| Location Tracking | ✅ GPS watch | ⚠️ No responder location API | ❌ NOT IMPLEMENTED |
| AI Recommendations | ✅ Display banners | ⚠️ Not in dispatch | ❌ NOT IMPLEMENTED |
| **Hospital Features** | | | |
| Dashboard Stats | ✅ Stats cards | ✅ `/analytics/stats` | 🔄 Needs Integration |
| Aid Requests | ✅ Full CRUD | ✅ `/aid-requests` | 🔄 Needs Integration |
| Case Transfers | ✅ Transfer UI | ✅ `/transfers` | 🔄 Needs Integration |
| Status Update | ✅ Status form | ✅ `/hospitals/{id}/status` | 🔄 Needs Integration |

### 2.2 Integration Priority

| Priority | Features | Rationale |
|----------|----------|-----------|
| **P0 - Critical** | Auth, SOS, Offline SMS | Core emergency functionality |
| **P1 - High** | Live Map, Alerts, Location | Real-time situational awareness |
| **P2 - Medium** | Profile, Medical Records, Hospital Dashboard | User management |
| **P3 - Low** | Responder Dispatch, News, Aid Requests | Enhanced features |

---

## Phase 1: Core Infrastructure

### Task 1.1: API Service Enhancement

**File:** `frontend/src/services/api.ts`

**Current State:** Basic API client exists but needs mobile-specific enhancements.

**Tasks:**
- [ ] Add request retry logic with exponential backoff
- [ ] Add request/response interceptors for logging
- [ ] Add network status check before requests
- [ ] Add request queue for offline mode
- [ ] Add request cancellation support
- [ ] Add response caching layer

**Implementation:**

```typescript
// Enhanced API configuration
const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  prefix: '/api/v1',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

// Request queue for offline support
interface QueuedRequest {
  id: string;
  endpoint: string;
  options: RequestInit;
  timestamp: number;
  retryCount: number;
}
```

### Task 1.2: Network Status Service

**File:** `frontend/src/services/networkService.ts`

**Tasks:**
- [ ] Create unified network status service
- [ ] Integrate with native networkService
- [ ] Add connection quality detection
- [ ] Add automatic request pausing when offline

### Task 1.3: Error Handling Service

**File:** `frontend/src/services/errorService.ts`

**Tasks:**
- [ ] Create centralized error handling
- [ ] Add error categorization (network, auth, validation, server)
- [ ] Add user-friendly error messages (i18n)
- [ ] Add error reporting/logging

### Task 1.4: Storage Abstraction Layer

**File:** `frontend/src/services/storageService.ts`

**Tasks:**
- [ ] Create unified storage interface
- [ ] Support secure storage for tokens
- [ ] Support IndexedDB for large data
- [ ] Support encryption for sensitive data

---

## Phase 2: Authentication & User Management

### Task 2.1: Auth Store Integration

**File:** `frontend/src/store/authStore.ts`

**Current State:** Has structure but uses mock login.

**Tasks:**
- [ ] Connect `login()` to `POST /auth/login`
- [ ] Handle JWT token storage securely
- [ ] Implement token refresh logic
- [ ] Add auto-logout on token expiry
- [ ] Add biometric authentication (native)
- [ ] Add session persistence across app restarts

**API Integration:**

```typescript
// POST /api/v1/auth/login
interface LoginRequest {
  phone: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  role: UserRole;
  user_id: string;
  hospital_id: string | null;
  patient_id: string | null;
  facility_type: 'hospital' | 'police' | 'civil_defense' | null;
}
```

### Task 2.2: Patient Registration Integration

**File:** `frontend/src/pages/patient/Register.tsx`

**Tasks:**
- [ ] Connect form to `POST /patients`
- [ ] Add field validation matching backend schema
- [ ] Handle registration errors
- [ ] Auto-login after registration
- [ ] Add location permission request flow

**API Integration:**

```typescript
// POST /api/v1/patients
interface PatientRegistration {
  phone: string;
  password: string;
  name: string;
  email?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  national_id?: string;
  primary_language?: string;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  mobility?: 'can_walk' | 'wheelchair' | 'bedridden' | 'other';
  living_situation?: 'alone' | 'with_family' | 'care_facility';
  blood_type?: string;
  chronic_conditions?: string[];
  allergies?: string[];
  current_medications?: string[];
  emergency_contacts?: EmergencyContact[];
  consent_given: boolean;
}
```

### Task 2.3: Profile Management

**File:** `frontend/src/pages/patient/Profile.tsx`

**Tasks:**
- [ ] Fetch profile from `GET /patients/{id}`
- [ ] Connect update form to `PUT /patients/{id}`
- [ ] Add emergency contacts management
- [ ] Add medical info section
- [ ] Add profile photo upload (if backend supports)

### Task 2.4: Medical Records

**File:** `frontend/src/pages/patient/MedicalRecords.tsx`

**Tasks:**
- [ ] Fetch records from `GET /patients/{id}/records`
- [ ] Display conditions, medications, allergies
- [ ] Add ability to update records
- [ ] Add special equipment tracking

---

## Phase 3: SOS & Emergency Features

### Task 3.1: SOS Store Creation

**File:** `frontend/src/store/sosStore.ts` (NEW)

**Tasks:**
- [ ] Create dedicated SOS state management
- [ ] Handle SOS lifecycle (idle → countdown → ai_assistant → sending → sent)
- [ ] Store pending SOS for offline sync
- [ ] Track SOS history
- [ ] Handle duplicate prevention

**Store Structure:**

```typescript
interface SOSStore {
  // State
  state: SOSScreenState;
  currentSOS: SOSRequest | null;
  pendingSOSQueue: QueuedSOS[];
  sosHistory: SOSHistoryEntry[];

  // Triage Data
  triageData: TriageData;

  // Actions
  startSOS: () => void;
  cancelSOS: () => void;
  sendSOS: (data: SOSPayload) => Promise<void>;
  queueOfflineSOS: (data: SOSPayload) => void;
  syncPendingQueue: () => Promise<void>;
  loadHistory: () => Promise<void>;
}
```

### Task 3.2: SOS Page Integration

**File:** `frontend/src/pages/patient/SOS.tsx`

**Tasks:**
- [ ] Connect to new sosStore
- [ ] Integrate with `POST /sos` endpoint
- [ ] Add location capture before send
- [ ] Add network status check
- [ ] Add offline fallback to SMS
- [ ] Add SOS status tracking after send

**API Integration:**

```typescript
// POST /api/v1/sos
interface SOSRequest {
  latitude: number;
  longitude: number;
  patient_status: 'safe' | 'injured' | 'trapped' | 'evacuate';
  severity: 1 | 2 | 3 | 4 | 5;
  details?: string;
}

interface SOSResponse {
  id: string;
  status: 'pending' | 'acknowledged' | 'dispatched' | 'resolved';
  hospital_notified_id: string | null;
  created_at: string;
}
```

### Task 3.3: AI Assistant Integration

**File:** `frontend/src/store/aiAssistantStore.ts`

**Tasks:**
- [ ] Enhance triage data collection
- [ ] Add severity calculation based on answers
- [ ] Map emergency types to backend enums
- [ ] Add AI response caching
- [ ] Add conversation timeout handling

**Severity Mapping:**

```typescript
function calculateSeverity(triageData: TriageData): number {
  let severity = 3; // Default medium

  if (triageData.injuryStatus === 'serious') severity = 5;
  else if (triageData.injuryStatus === 'minor') severity = 3;

  if (triageData.canMove === 'trapped') severity = Math.max(severity, 4);
  if (triageData.emergencyType === 'danger') severity = Math.max(severity, 4);

  return severity;
}
```

### Task 3.4: SMS Fallback Enhancement

**File:** `frontend/src/services/smsService.ts`

**Tasks:**
- [ ] Verify encryption matches backend decryption
- [ ] Add SMS number configuration
- [ ] Add fallback trigger logic
- [ ] Add SMS send confirmation
- [ ] Test full SMS → Backend flow

**SMS Format:**

```
TMT:v1:<base64-encrypted-payload>

Payload (before encryption):
{
  "u": "patient_uuid",
  "l": "24.71,46.67",  // lat,lng
  "s": "injured",
  "v": 4,
  "t": 1709251200
}
```

### Task 3.5: Location Service Integration

**Tasks:**
- [ ] Continuous location tracking during SOS
- [ ] Send location updates to `POST /patients/{id}/location`
- [ ] Check for auto-resolution (patient at hospital)
- [ ] Add location accuracy indicators

---

## Phase 4: Real-time Features

### Task 4.1: WebSocket Service Enhancement

**File:** `frontend/src/services/socketService.ts` (NEW)

**Tasks:**
- [ ] Create dedicated Socket.IO service
- [ ] Handle connection lifecycle
- [ ] Implement room joining based on role
- [ ] Add reconnection with exponential backoff
- [ ] Add event queuing during disconnect
- [ ] Add heartbeat/ping monitoring

**Implementation:**

```typescript
class SocketService {
  private socket: Socket | null = null;
  private eventQueue: QueuedEvent[] = [];

  connect(token: string): void {
    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
    this.joinRoomsBasedOnRole();
  }

  private joinRoomsBasedOnRole(): void {
    const { user } = useAuthStore.getState();

    if (user?.role === 'patient') {
      this.socket?.emit('join_patient', { patient_id: user.patient_id });
      this.socket?.emit('join_map');
    } else if (user?.role?.includes('admin')) {
      this.socket?.emit('join_alerts');
      this.socket?.emit('join_map');
      this.socket?.emit('join_hospital', { hospital_id: user.hospital_id });
    }
  }
}
```

### Task 4.2: Alert Store WebSocket Integration

**File:** `frontend/src/store/alertStore.ts`

**Tasks:**
- [ ] Subscribe to `new_alert` events
- [ ] Subscribe to `new_sos` events
- [ ] Add local notification trigger
- [ ] Add haptic feedback for critical alerts
- [ ] Update unread count in real-time

### Task 4.3: Map Store WebSocket Integration

**File:** `frontend/src/store/mapStore.ts`

**Tasks:**
- [ ] Subscribe to `map_event` events
- [ ] Subscribe to `hospital_status` events
- [ ] Subscribe to `patient_location` events
- [ ] Update map markers in real-time
- [ ] Add event expiration handling

### Task 4.4: Push Notification Integration

**File:** `frontend/src/services/pushService.ts`

**Tasks:**
- [ ] Register device for push notifications
- [ ] Send FCM/APNS token to backend
- [ ] Handle notification tap navigation
- [ ] Add notification categories (SOS, Alert, Info)
- [ ] Add quiet hours support

---

## Phase 5: Field Responder Integration

### Task 5.1: Responder Store Enhancement

**File:** `frontend/src/store/responderStore.ts`

**Current State:** Uses demo data, no backend connection.

**Tasks:**
- [ ] Create responder authentication flow
- [ ] Add case assignment subscription (WebSocket)
- [ ] Add case status update API calls
- [ ] Add location tracking with backend sync
- [ ] Remove demo data, use real API

**Required Backend Endpoints (NOT YET IMPLEMENTED):**

```
GET /api/v1/responders/me/case          - Get current assigned case
PUT /api/v1/responders/me/case/status   - Update case status
POST /api/v1/responders/me/location     - Update responder location
GET /api/v1/responders/me/history       - Get case history
PUT /api/v1/responders/me/duty          - Toggle duty status
```

### Task 5.2: Case Assignment WebSocket

**Tasks:**
- [ ] Subscribe to `case_assigned` event
- [ ] Subscribe to `case_updated` event
- [ ] Add case acceptance flow
- [ ] Add case rejection flow
- [ ] Add ETA calculation

### Task 5.3: Status Update Flow

**Tasks:**
- [ ] Map UI status buttons to API calls
- [ ] Add status transition validation
- [ ] Add timestamp tracking
- [ ] Add offline status queue

**Status Transitions:**

```
pending → accepted → en_route → on_scene → transporting → completed
                                    ↓
                               transporting → completed
```

### Task 5.4: Equipment Checklist Backend

**Tasks:**
- [ ] Fetch required equipment from case
- [ ] Track checked items locally
- [ ] Sync checklist completion status

---

## Phase 6: News & Alerts

### Task 6.1: News Service Creation

**File:** `frontend/src/services/newsService.ts` (NEW)

**Note:** Backend does NOT have news endpoints yet.

**Tasks:**
- [ ] Document required news API structure
- [ ] Create news API client (when backend ready)
- [ ] Implement local caching
- [ ] Add pull-to-refresh
- [ ] Add infinite scroll/pagination

**Required Backend Endpoints (NOT YET IMPLEMENTED):**

```
GET /api/v1/news                    - List news articles
GET /api/v1/news/{id}               - Get article detail
GET /api/v1/news/nearby             - Get news near location
POST /api/v1/news/{id}/report       - Report false news
```

### Task 6.2: News Store Integration

**File:** `frontend/src/store/newsStore.ts`

**Tasks:**
- [ ] Replace dummy data with API calls
- [ ] Add background refresh
- [ ] Add location-based filtering
- [ ] Add trust score filtering
- [ ] Add search functionality

### Task 6.3: Alert Page Integration

**File:** `frontend/src/pages/patient/Alerts.tsx`

**Tasks:**
- [ ] Fetch alerts from `GET /alerts`
- [ ] Filter to patient-relevant alerts
- [ ] Add severity-based sorting
- [ ] Add location-based filtering
- [ ] Add mark as read functionality

---

## Phase 7: Offline Support

### Task 7.1: IndexedDB Schema

**File:** `frontend/src/services/offlineStorage.ts` (NEW)

**Tasks:**
- [ ] Define IndexedDB schema
- [ ] Create migration system
- [ ] Add CRUD operations
- [ ] Add sync status tracking

**Schema:**

```typescript
const DB_SCHEMA = {
  name: 'tmt-offline',
  version: 1,
  stores: {
    pending_sos: {
      keyPath: 'id',
      indexes: ['timestamp', 'status', 'synced']
    },
    cached_profile: {
      keyPath: 'patient_id'
    },
    cached_medical_records: {
      keyPath: 'id',
      indexes: ['patient_id']
    },
    cached_alerts: {
      keyPath: 'id',
      indexes: ['created_at', 'severity']
    },
    pending_location_updates: {
      keyPath: 'id',
      indexes: ['timestamp']
    }
  }
};
```

### Task 7.2: Background Sync Service

**File:** `frontend/src/services/syncService.ts` (NEW)

**Tasks:**
- [ ] Implement background sync logic
- [ ] Add sync queue management
- [ ] Add conflict resolution
- [ ] Add sync status notifications
- [ ] Add retry with backoff

### Task 7.3: Service Worker Enhancement

**File:** `frontend/public/sw.js` or Workbox config

**Tasks:**
- [ ] Add API response caching
- [ ] Add background sync for SOS
- [ ] Add push notification handling
- [ ] Add offline page fallback

---

## Phase 8: Testing & Quality Assurance

### Task 8.1: Unit Tests

**Tasks:**
- [ ] Test all new services
- [ ] Test store integrations
- [ ] Test API error handling
- [ ] Test offline scenarios
- [ ] Achieve 80%+ coverage

### Task 8.2: Integration Tests

**Tasks:**
- [ ] Test full SOS flow
- [ ] Test auth flow
- [ ] Test WebSocket connection
- [ ] Test offline → online sync

### Task 8.3: E2E Tests

**Tasks:**
- [ ] Test patient journey
- [ ] Test responder journey
- [ ] Test hospital dashboard
- [ ] Test cross-device sync

---

## Not Yet Implemented Features

### Backend Features Needed

| Feature | Priority | Description | API Design |
|---------|----------|-------------|------------|
| **News API** | P2 | Social media crisis news aggregation | See Section 6.1 |
| **Responder Dispatch API** | P3 | Case assignment and status tracking | See below |
| **Photo Upload** | P2 | SOS image attachments | See below |
| **Responder Location Tracking** | P3 | Real-time responder positions | See below |
| **Equipment Checklists** | P3 | Case-specific equipment lists | See below |

### Detailed API Designs for Missing Features

#### 1. News API Design

```yaml
# GET /api/v1/news
Query Parameters:
  - category: threat|update|warning|info
  - severity: critical|high|medium|low
  - source_platform: twitter|telegram|facebook|instagram
  - min_trust_score: 0-100
  - latitude: float
  - longitude: float
  - radius_km: float
  - search: string
  - limit: int (default 20)
  - offset: int (default 0)

Response:
  - id: uuid
  - title: string
  - summary: string
  - content: string
  - source_platform: string
  - source_url: string
  - source_author: string
  - latitude: float
  - longitude: float
  - location_name: string
  - distance_km: float (calculated)
  - trust_score: 0-100
  - priority_score: float
  - relevance_tags: string[]
  - category: string
  - severity: string
  - media_urls: string[]
  - engagement_count: int
  - verified: boolean
  - published_at: datetime
  - created_at: datetime
```

#### 2. Responder Dispatch API Design

```yaml
# GET /api/v1/responders/me
Response:
  - id: uuid
  - user_id: uuid
  - responder_type: ambulance_driver|police_officer|civil_defense_responder|firefighter
  - is_on_duty: boolean
  - current_location: {lat, lng, updated_at}
  - facility_id: uuid
  - active_case_id: uuid | null

# GET /api/v1/responders/me/case
Response:
  - id: uuid
  - case_number: string
  - type: medical|security|fire|rescue|hazmat|accident
  - priority: critical|high|medium|low
  - status: pending|accepted|en_route|on_scene|transporting|completed
  - brief_description: string
  - victim_count: int
  - notes: string
  - victim_info: {name, age, gender, phone, blood_type, medical_conditions, allergies}
  - pickup_location: {lat, lng, address, landmark}
  - destination: {lat, lng, name, address, type, phone}
  - ai_recommendations: string[]
  - required_equipment: string[]
  - dispatch_phone: string
  - created_at: datetime
  - assigned_at: datetime

# PUT /api/v1/responders/me/case/status
Request:
  - status: accepted|en_route|on_scene|transporting|completed
  - notes: string (optional)
Response:
  - success: boolean
  - case: CaseResponse

# POST /api/v1/responders/me/location
Request:
  - latitude: float
  - longitude: float
  - accuracy: float
  - heading: float
  - speed: float
Response:
  - success: boolean

# PUT /api/v1/responders/me/duty
Request:
  - is_on_duty: boolean
Response:
  - success: boolean
  - responder: ResponderResponse

# GET /api/v1/responders/me/history
Query Parameters:
  - limit: int
  - offset: int
  - from_date: datetime
  - to_date: datetime
Response:
  - items: CaseHistoryEntry[]
  - total: int
```

#### 3. Photo Upload API Design

```yaml
# POST /api/v1/sos/{sos_id}/attachments
Request (multipart/form-data):
  - file: binary (image/jpeg, image/png)
  - type: incident_photo|injury_photo|scene_photo
Response:
  - id: uuid
  - sos_id: uuid
  - url: string
  - thumbnail_url: string
  - type: string
  - uploaded_at: datetime

# Alternative: Base64 in SOS request
# POST /api/v1/sos
Request:
  - ... existing fields ...
  - attachments: [{
      data: string (base64),
      mime_type: string,
      type: string
    }]
```

#### 4. WebSocket Events for Responder

```yaml
# Server → Client Events

case_assigned:
  room: responder_{responder_id}
  data:
    - case_id: uuid
    - case_number: string
    - priority: string
    - type: string
    - pickup_location: {lat, lng, address}
    - brief_description: string

case_updated:
  room: responder_{responder_id}
  data:
    - case_id: uuid
    - field: string (what changed)
    - old_value: any
    - new_value: any

case_cancelled:
  room: responder_{responder_id}
  data:
    - case_id: uuid
    - reason: string

# Client → Server Events

update_location:
  data:
    - latitude: float
    - longitude: float
    - accuracy: float
    - timestamp: int
```

### Frontend Features Pending Backend

| Feature | Frontend Status | Backend Needed |
|---------|-----------------|----------------|
| News Feed | ✅ Full UI | News API endpoints |
| Trust Score Badge | ✅ Component | News API with scores |
| Responder Active Case | ✅ Full UI | Responder dispatch API |
| Case Status Updates | ✅ UI buttons | Status update endpoint |
| Equipment Checklist | ✅ UI | Equipment list in case |
| Duty Status Toggle | ✅ UI | Duty status endpoint |
| Photo Upload in SOS | ✅ Camera capture | Attachment upload endpoint |
| Responder History | ✅ History page | History endpoint |
| Real-time Responder Location | ✅ GPS tracking | Location tracking endpoint |

---

## API Endpoint Reference

### Authentication

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/auth/login` | None | `{phone, password}` | `{access_token, role, user_id, ...}` |

### Patients

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/patients` | Admin | Query: search, limit, offset | `[PatientResponse]` |
| POST | `/patients` | None | PatientRegistration | PatientResponse |
| GET | `/patients/{id}` | Patient/Admin | - | PatientResponse |
| PUT | `/patients/{id}` | Patient/Admin | PatientUpdate | PatientResponse |
| GET | `/patients/{id}/records` | Patient/Admin | - | `[MedicalRecord]` |
| GET | `/patients/{id}/sos` | Patient/Admin | - | `[SOSResponse]` |
| GET | `/patients/{id}/nearest-hospital` | Patient | - | HospitalResponse |
| POST | `/patients/{id}/location` | Patient | `{latitude, longitude}` | `{success}` |

### SOS

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/sos` | Patient | SOSRequest | SOSResponse |
| GET | `/sos` | Admin | Query: status, severity | `[SOSResponse]` |
| PUT | `/sos/{id}/status` | Admin | `{status, hospital_id}` | SOSResponse |

### Hospitals

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/hospitals` | Auth | Query: status, department_type | `[HospitalResponse]` |
| POST | `/hospitals` | Admin | HospitalCreate | HospitalResponse |
| PUT | `/hospitals/{id}/status` | Admin | StatusUpdate | HospitalResponse |
| PUT | `/hospitals/{id}/profile` | Admin | ProfileUpdate | HospitalResponse |

### Alerts

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/alerts` | Auth | Query: severity, event_type | `[AlertResponse]` |
| POST | `/alerts` | Admin | AlertCreate | AlertResponse |
| PUT | `/alerts/{id}/acknowledge` | Admin | - | AlertResponse |

### Map

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/map/events` | Auth | Query: hours, layer, severity | `[MapEvent]` |
| GET | `/map/layers` | Auth | - | `[LayerDefinition]` |
| GET | `/map/stream` | Auth | - | SSE stream |

### Analytics

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/analytics/stats` | Auth | - | AnalyticsStats |
| GET | `/analytics/heatmap` | Auth | Query: type, timerange | `[HeatmapPoint]` |

### Aid Requests

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/aid-requests` | Auth | Query: category, urgency, status | `[AidRequest]` |
| POST | `/aid-requests` | Admin | AidRequestCreate | AidRequest |
| PUT | `/aid-requests/{id}/respond` | Admin | AidResponse | AidRequest |
| PUT | `/aid-requests/{id}/status` | Admin | `{status}` | AidRequest |

### SMS (Webhook)

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/sms/inbound` | Twilio Signature | Twilio form data | TwiML |

---

## Data Flow Diagrams

### SOS Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Patient   │     │   Mobile    │     │   Backend   │     │  Hospital   │
│   Trigger   │────▶│    App      │────▶│    API      │────▶│  Dashboard  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘     └─────────────┘
                           │                   │
                    5s countdown               │
                           │                   │
                    AI Triage                  │
                    (offline capable)          │
                           │                   │
                    ┌──────▼──────┐            │
                    │  Online?    │            │
                    └──────┬──────┘            │
              Yes ─────────┼───────── No       │
                    │             │            │
             POST /sos     SMS Fallback        │
                    │             │            │
                    └──────┬──────┘            │
                           │                   │
                    ┌──────▼──────┐            │
                    │  AI Triage  │◀───────────┘
                    │  Pipeline   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ WebSocket   │────────────▶ Dashboard
                    │ Broadcast   │────────────▶ Responder
                    └─────────────┘────────────▶ Patient
```

### Real-time Update Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Event      │     │  Backend    │     │  Connected  │
│  Source     │────▶│  WebSocket  │────▶│  Clients    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       new_alert     new_sos      map_event
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌──────▼──────┐
       │ alertStore  │ │sosStore│ │  mapStore   │
       └──────┬──────┘ └───┬───┘ └──────┬──────┘
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌──────▼──────┐
       │ Alert UI    │ │SOS UI │ │   Map UI    │
       │ Update      │ │Update │ │   Update    │
       └─────────────┘ └───────┘ └─────────────┘
```

---

## Security Considerations

### Authentication

- JWT tokens stored in secure storage (Keychain/Keystore on native)
- Token expiry: 8 hours (configurable)
- Biometric authentication for sensitive actions
- Auto-logout on background timeout

### Data Encryption

- SMS SOS: AES-128-GCM encryption with patient-derived key
- Medical records: End-to-end encryption option
- Token storage: Platform secure storage
- HTTPS for all API calls

### Privacy

- Minimal data in SMS (compact JSON)
- Location data only when needed
- Consent tracking and audit logs
- GDPR compliance for data retention

### Input Validation

- All inputs validated client-side before send
- Server-side validation as final authority
- SQL injection prevention via parameterized queries
- XSS prevention via React's default escaping

---

## Implementation Timeline

### Week 1-2: Core Infrastructure (Phase 1)
- API service enhancement
- Network status service
- Error handling
- Storage abstraction

### Week 2-3: Authentication (Phase 2)
- Auth store integration
- Patient registration
- Profile management
- Medical records

### Week 3-4: SOS Features (Phase 3)
- SOS store creation
- SOS page integration
- AI assistant enhancement
- SMS fallback
- Location service

### Week 4-5: Real-time (Phase 4)
- WebSocket service
- Alert store integration
- Map store integration
- Push notifications

### Week 5-6: Responder (Phase 5)
- Responder store (with available backend)
- Case assignment
- Status updates
- Equipment checklists

### Week 6-7: News & Alerts (Phase 6)
- News service (when backend ready)
- News store integration
- Alert page integration

### Week 7-8: Offline & Testing (Phase 7-8)
- IndexedDB schema
- Background sync
- Service worker
- Unit tests
- Integration tests
- E2E tests

---

## Appendix: File Structure

```
frontend/src/
├── components/
│   ├── common/
│   ├── sos/
│   ├── news/
│   ├── maps/
│   ├── responder/
│   ├── alerts/
│   └── charts/
├── pages/
│   ├── patient/
│   ├── responder/
│   ├── hospital/
│   └── admin/
├── store/
│   ├── authStore.ts
│   ├── sosStore.ts (NEW)
│   ├── alertStore.ts
│   ├── mapStore.ts
│   ├── newsStore.ts
│   └── responderStore.ts
├── services/
│   ├── api.ts (ENHANCE)
│   ├── socketService.ts (NEW)
│   ├── networkService.ts (NEW)
│   ├── errorService.ts (NEW)
│   ├── newsService.ts (NEW)
│   ├── offlineStorage.ts (NEW)
│   ├── syncService.ts (NEW)
│   ├── mapService.ts
│   └── smsService.ts
├── native/
│   ├── platform.ts
│   ├── geolocationService.ts
│   ├── cameraService.ts
│   ├── pushService.ts
│   ├── localNotificationService.ts
│   ├── deviceService.ts
│   ├── hapticService.ts
│   ├── networkService.ts
│   └── storageService.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useWebSocket.ts (ENHANCE)
│   ├── useLiveMap.ts
│   ├── useVoiceInput.ts
│   ├── useConversationTimer.ts
│   ├── useBatteryStatus.ts
│   ├── useOffline.ts
│   └── useSMSFallback.ts
├── types/
│   ├── sosTypes.ts
│   ├── newsTypes.ts
│   └── responderTypes.ts
├── config/
│   ├── sosConfig.ts
│   └── conversationFlow.ts
└── utils/
    ├── encryption.ts
    ├── locationCodec.ts
    └── formatting.ts
```

---

## Document Metadata

- **Version:** 1.0.0
- **Created:** 2026-02-16
- **Author:** Claude Code (AI Assistant)
- **Project:** TMT (Triage & Monitor for Threats)
- **Status:** Planning Complete - Ready for Implementation
