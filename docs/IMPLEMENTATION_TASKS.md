# TMT Mobile-Backend Integration - Implementation Tasks

## Quick Reference

**Legend:**
- ⬜ Not Started
- 🔄 In Progress
- ✅ Completed
- ❌ Blocked (needs backend)
- ⚠️ Needs Review

---

## Phase 1: Core Infrastructure

### 1.1 API Service Enhancement
**File:** `frontend/src/services/api.ts`

| Task | Status | Notes |
|------|--------|-------|
| Add request retry logic with exponential backoff | ⬜ | Max 3 retries, 1s/2s/4s delays |
| Add request/response interceptors for logging | ⬜ | Log in development mode only |
| Add network status check before requests | ⬜ | Use networkService.isOnline() |
| Add request queue for offline mode | ⬜ | Queue POST/PUT, not GET |
| Add request cancellation support (AbortController) | ⬜ | Cancel on component unmount |
| Add response caching layer | ⬜ | Cache GET responses in memory |

**Acceptance Criteria:**
- [ ] Requests retry automatically on network failure
- [ ] Failed requests are queued when offline
- [ ] Queued requests sync when online
- [ ] Requests can be cancelled

---

### 1.2 Network Status Service
**File:** `frontend/src/services/networkStatusService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create unified network status service | ⬜ | Wrap native/web implementations |
| Add connection quality detection | ⬜ | Detect slow 2G/3G connections |
| Add automatic request pausing when offline | ⬜ | Integrate with api.ts |
| Add network change event emitter | ⬜ | Allow subscription to changes |

**Code Template:**
```typescript
// frontend/src/services/networkStatusService.ts
import { getNetworkStatus, addNetworkListener } from '../native/networkService';

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export interface NetworkStatusService {
  isOnline(): Promise<boolean>;
  getQuality(): Promise<ConnectionQuality>;
  onStatusChange(callback: (online: boolean) => void): () => void;
}
```

---

### 1.3 Error Handling Service
**File:** `frontend/src/services/errorService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create centralized error handling | ⬜ | Single place for all errors |
| Add error categorization | ⬜ | network/auth/validation/server |
| Add user-friendly error messages (i18n) | ⬜ | Use existing i18n setup |
| Add error reporting/logging | ⬜ | Console in dev, analytics in prod |

**Error Types:**
```typescript
export enum ErrorType {
  NETWORK = 'network',
  AUTH = 'auth',
  VALIDATION = 'validation',
  SERVER = 'server',
  UNKNOWN = 'unknown',
}

export interface AppError {
  type: ErrorType;
  code: string;
  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
}
```

---

### 1.4 Storage Abstraction Layer
**File:** `frontend/src/services/secureStorage.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create unified storage interface | ⬜ | Abstract native/web storage |
| Add secure storage for tokens | ⬜ | Use Keychain/Keystore on native |
| Add IndexedDB wrapper for large data | ⬜ | For offline data |
| Add encryption for sensitive data | ⬜ | Use existing encryption.ts |

---

## Phase 2: Authentication & User Management

### 2.1 Auth Store Integration
**File:** `frontend/src/store/authStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Connect `login()` to `POST /auth/login` | ⬜ | Replace mock implementation |
| Store JWT token securely | ⬜ | Use secureStorage service |
| Implement token refresh logic | ⬜ | Refresh before expiry |
| Add auto-logout on token expiry | ⬜ | Check expiry on each request |
| Add biometric authentication (native) | ⬜ | Optional fingerprint/face unlock |
| Add session persistence across restarts | ⬜ | Restore session on app open |
| Add role-based navigation | ⬜ | Redirect by role after login |

**Implementation Steps:**
1. Modify `login()` action to call API
2. Parse response and extract token/user
3. Store token in secure storage
4. Set up token refresh timer
5. Handle 401 errors globally

---

### 2.2 Patient Registration Integration
**File:** `frontend/src/pages/patient/Register.tsx` (or `RegisterPage.tsx`)

| Task | Status | Notes |
|------|--------|-------|
| Connect form to `POST /patients` | ⬜ | Map form fields to API |
| Add field validation matching backend schema | ⬜ | Validate before submit |
| Handle registration errors | ⬜ | Show specific error messages |
| Auto-login after registration | ⬜ | Call login after successful register |
| Add location permission request flow | ⬜ | Request GPS before register |
| Add phone number verification UI | ⬜ | OTP flow if backend supports |

**Required Form Fields:**
```typescript
interface RegistrationForm {
  // Required
  phone: string;         // +966501234567 format
  password: string;      // Min 8 chars
  name: string;          // Full name
  consent_given: boolean;

  // Optional but recommended
  email?: string;
  date_of_birth?: string; // YYYY-MM-DD
  gender?: 'male' | 'female' | 'other';
  blood_type?: string;

  // Location
  latitude?: number;
  longitude?: number;
  location_name?: string;

  // Medical
  chronic_conditions?: string[];
  allergies?: string[];
  current_medications?: string[];

  // Emergency contacts
  emergency_contacts?: {
    name: string;
    phone: string;
    relationship: string;
  }[];
}
```

---

### 2.3 Profile Management
**File:** `frontend/src/pages/patient/Profile.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Fetch profile from `GET /patients/{id}` | ⬜ | On page load |
| Display all profile fields | ⬜ | Read-only initially |
| Create edit mode toggle | ⬜ | Switch to edit form |
| Connect update form to `PUT /patients/{id}` | ⬜ | Submit changes |
| Add emergency contacts management | ⬜ | Add/edit/remove contacts |
| Add validation for phone/email formats | ⬜ | Validate before submit |
| Cache profile locally | ⬜ | For offline access |

---

### 2.4 Medical Records
**File:** `frontend/src/pages/patient/MedicalRecords.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Fetch records from `GET /patients/{id}/records` | ⬜ | On page load |
| Display conditions, medications, allergies | ⬜ | Organized sections |
| Add ability to update records | ⬜ | Edit mode |
| Add special equipment tracking | ⬜ | Wheelchair, oxygen, etc. |
| Cache records locally | ⬜ | For offline/SOS access |

---

## Phase 3: SOS & Emergency Features

### 3.1 SOS Store Creation
**File:** `frontend/src/store/sosStore.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create SOS state management store | ⬜ | New Zustand store |
| Define SOS lifecycle states | ⬜ | idle→countdown→triage→sending→sent |
| Add pending SOS queue for offline | ⬜ | IndexedDB backed |
| Add SOS history tracking | ⬜ | Past SOS requests |
| Add duplicate prevention (5 min window) | ⬜ | Prevent spam |

**Store Structure:**
```typescript
interface SOSStore {
  // State
  screenState: 'idle' | 'countdown' | 'ai_assistant' | 'sending' | 'sent' | 'error';
  currentSOS: SOSRequest | null;
  pendingQueue: QueuedSOS[];
  history: SOSHistoryEntry[];

  // Countdown
  countdownSeconds: number;

  // Error
  error: string | null;

  // Actions
  startCountdown: () => void;
  cancelCountdown: () => void;
  startAIAssistant: () => void;
  sendSOS: (data: SOSPayload) => Promise<SOSResponse>;
  queueOfflineSOS: (data: SOSPayload) => void;
  syncPendingQueue: () => Promise<void>;
  loadHistory: () => Promise<void>;
  reset: () => void;
}
```

---

### 3.2 SOS Page Integration
**File:** `frontend/src/pages/patient/SOS.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Connect to new sosStore | ⬜ | Replace local state |
| Get current location before SOS | ⬜ | Use geolocationService |
| Integrate with `POST /sos` endpoint | ⬜ | API call in store |
| Calculate severity from triage answers | ⬜ | Use severity mapping |
| Map patient_status from emergency type | ⬜ | Use status mapping |
| Add network status check | ⬜ | Determine online/offline |
| Add offline fallback to SMS | ⬜ | Trigger SMS if offline |
| Show SOS status after send | ⬜ | pending/acknowledged |
| Add retry on failure | ⬜ | Auto-retry or manual |

**Severity Mapping Logic:**
```typescript
function calculateSeverity(triage: TriageData): 1 | 2 | 3 | 4 | 5 {
  let severity = 3; // Default medium

  // Injury status impact
  if (triage.injuryStatus === 'serious') severity = 5;
  else if (triage.injuryStatus === 'minor') severity = 3;
  else if (triage.injuryStatus === 'none') severity = 2;

  // Trapped status boost
  if (triage.canMove === 'trapped') severity = Math.max(severity, 4);

  // Emergency type boost
  if (triage.emergencyType === 'danger') severity = Math.max(severity, 4);
  if (triage.emergencyType === 'trapped') severity = Math.max(severity, 4);

  // Multiple people boost
  if (triage.peopleCount === 'more_than_3') severity = Math.min(severity + 1, 5);

  return severity as 1 | 2 | 3 | 4 | 5;
}

function mapPatientStatus(emergencyType: string): string {
  const mapping: Record<string, string> = {
    'medical': 'injured',
    'danger': 'safe',
    'trapped': 'trapped',
    'evacuate': 'evacuate',
  };
  return mapping[emergencyType] || 'injured';
}
```

---

### 3.3 AI Assistant Store Enhancement
**File:** `frontend/src/store/aiAssistantStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Ensure triage data maps to API fields | ⬜ | Verify field names match |
| Add urgency keyword detection | ⬜ | Auto-send on "help now" etc |
| Add low battery mode (max 2 questions) | ⬜ | Expedite when battery < 15% |
| Add total conversation time limit | ⬜ | Max 120 seconds |
| Add auto-send on 30s inactivity | ⬜ | Per configuration |

---

### 3.4 SMS Fallback Enhancement
**File:** `frontend/src/services/smsService.ts`

| Task | Status | Notes |
|------|--------|-------|
| Verify encryption matches backend | ⬜ | Test full roundtrip |
| Configure SMS recipient number | ⬜ | Environment variable |
| Add SMS send confirmation | ⬜ | Track if SMS opened |
| Test SMS → Backend → WebSocket flow | ⬜ | End-to-end test |
| Add fallback trigger logic | ⬜ | When to use SMS vs API |

**Test Cases:**
1. Send encrypted SMS manually
2. Verify backend receives via Twilio webhook
3. Verify SOS is created in database
4. Verify WebSocket broadcast occurs
5. Verify patient/hospital see the SOS

---

### 3.5 Location Service Integration
**File:** `frontend/src/hooks/useSOSLocation.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create SOS-specific location hook | ⬜ | Combines features |
| Start continuous tracking on SOS start | ⬜ | High accuracy |
| Send location updates during active SOS | ⬜ | Every 30 seconds |
| Call `POST /patients/{id}/location` | ⬜ | Update server |
| Handle auto-resolution (at hospital) | ⬜ | Backend handles, we show status |

---

## Phase 4: Real-time Features

### 4.1 WebSocket Service Creation
**File:** `frontend/src/services/socketService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create Socket.IO service singleton | ⬜ | Single connection |
| Handle connection lifecycle | ⬜ | connect/disconnect/reconnect |
| Implement room joining by role | ⬜ | Auto-join on connect |
| Add reconnection with backoff | ⬜ | 1s→2s→4s→8s, max 10 attempts |
| Add event queue during disconnect | ⬜ | Cache events, replay on reconnect |
| Add heartbeat monitoring | ⬜ | Detect stale connections |
| Add connection status events | ⬜ | Notify UI of status |

**Implementation:**
```typescript
// frontend/src/services/socketService.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

class SocketService {
  private socket: Socket | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private statusListeners: Set<(status: string) => void> = new Set();

  connect(): void {
    const { token, user } = useAuthStore.getState();
    if (!token) return;

    this.connectionStatus = 'connecting';
    this.notifyStatusChange();

    this.socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:8000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    this.socket.on('connect', () => {
      this.connectionStatus = 'connected';
      this.notifyStatusChange();
      this.joinRooms(user);
    });

    this.socket.on('disconnect', () => {
      this.connectionStatus = 'disconnected';
      this.notifyStatusChange();
    });
  }

  private joinRooms(user: AuthUser | null): void {
    if (!user || !this.socket) return;

    if (user.role === 'patient') {
      this.socket.emit('join_patient', { patient_id: user.patient_id });
      this.socket.emit('join_map');
    } else if (user.role?.includes('admin')) {
      this.socket.emit('join_alerts');
      this.socket.emit('join_map');
      if (user.hospital_id) {
        this.socket.emit('join_hospital', {
          hospital_id: user.hospital_id,
          department_type: user.facility_type,
        });
      }
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }

  onStatusChange(callback: (status: string) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatusChange(): void {
    this.statusListeners.forEach(cb => cb(this.connectionStatus));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionStatus = 'disconnected';
  }
}

export const socketService = new SocketService();
```

---

### 4.2 Alert Store WebSocket Integration
**File:** `frontend/src/store/alertStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Subscribe to `new_alert` event | ⬜ | Add to alerts array |
| Subscribe to `new_sos` event | ⬜ | Add to alerts if relevant |
| Subscribe to `sos_resolved` event | ⬜ | Update SOS status |
| Trigger local notification | ⬜ | For critical/high alerts |
| Add haptic feedback for critical | ⬜ | Vibrate on critical |
| Update unread count | ⬜ | Increment on new |

**Integration Code:**
```typescript
// Add to alertStore.ts or create useAlertWebSocket hook
export function initAlertWebSocket() {
  socketService.on('new_alert', (alert: Alert) => {
    const { addAlert } = useAlertStore.getState();
    addAlert(alert);

    // Trigger notification for high/critical
    if (['high', 'critical'].includes(alert.severity)) {
      showLocalNotification({
        title: alert.title,
        body: alert.details || '',
        data: { alertId: alert.id },
      });

      if (alert.severity === 'critical') {
        notificationError(); // Haptic
      }
    }
  });

  socketService.on('new_sos', (sos: SOSEvent) => {
    // Handle if user is hospital staff
    const { user } = useAuthStore.getState();
    if (user?.role?.includes('admin')) {
      const { addAlert } = useAlertStore.getState();
      addAlert({
        id: sos.id,
        event_type: 'medical_emergency',
        severity: mapSeverityToEnum(sos.severity),
        title: `SOS: ${sos.patient_status}`,
        details: sos.details,
        latitude: sos.latitude,
        longitude: sos.longitude,
        source: 'sos',
        created_at: sos.created_at,
      });
    }
  });
}
```

---

### 4.3 Map Store WebSocket Integration
**File:** `frontend/src/store/mapStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Subscribe to `map_event` events | ⬜ | Add/update events |
| Subscribe to `hospital_status` events | ⬜ | Update hospital markers |
| Subscribe to `patient_location` events | ⬜ | For responders |
| Handle event expiration | ⬜ | Remove expired events |
| Add real-time marker updates | ⬜ | Animate changes |

---

### 4.4 Push Notification Integration
**File:** `frontend/src/services/pushNotificationService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Initialize push on app start | ⬜ | After login |
| Register FCM/APNS token | ⬜ | Get from native |
| Send token to backend | ❌ | Backend endpoint needed |
| Handle notification tap | ⬜ | Navigate to relevant screen |
| Add notification categories | ⬜ | SOS, Alert, Info |
| Handle foreground notifications | ⬜ | Show in-app banner |

**Note:** Backend needs a `/users/me/push-token` endpoint to store FCM tokens.

---

## Phase 5: Field Responder Integration

### 5.1 Responder Store Enhancement
**File:** `frontend/src/store/responderStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Remove demo data | ❌ | Need backend first |
| Add case fetch from API | ❌ | `/responders/me/case` needed |
| Add case status update API | ❌ | Status endpoint needed |
| Add location tracking sync | ❌ | Location endpoint needed |
| Add duty status toggle API | ❌ | Duty endpoint needed |
| Subscribe to case assignments | ❌ | WebSocket event needed |

**Backend Endpoints Required:**
```
GET  /api/v1/responders/me/case          - Current assigned case
PUT  /api/v1/responders/me/case/status   - Update case status
POST /api/v1/responders/me/location      - Update location
PUT  /api/v1/responders/me/duty          - Toggle duty status
GET  /api/v1/responders/me/history       - Case history
```

**WebSocket Events Required:**
```
case_assigned   - New case assigned
case_updated    - Case details changed
case_cancelled  - Case cancelled
```

**Blocking Status:** Blocked until backend implements responder dispatch API.

---

### 5.2 Case Status Flow Implementation
**File:** `frontend/src/components/responder/CaseStatusButton.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Connect to status update API | ❌ | Blocked on backend |
| Add status transition validation | ⬜ | Client-side validation |
| Add confirmation dialogs | ✅ | Already implemented |
| Add offline status queue | ⬜ | Queue for later sync |

---

### 5.3 Equipment Checklist Backend
**File:** `frontend/src/components/responder/EquipmentChecklist.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Fetch equipment from case API | ❌ | Blocked on backend |
| Track checked items locally | ✅ | Already works |
| Sync checklist to backend | ❌ | No endpoint |

---

## Phase 6: News & Alerts

### 6.1 News Service Creation
**File:** `frontend/src/services/newsService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Create news API client | ❌ | Backend endpoint needed |
| Implement local caching | ⬜ | Can implement now |
| Add pull-to-refresh | ⬜ | Can implement now |
| Add infinite scroll | ⬜ | Can implement now |

**Backend Endpoint Required:**
```
GET /api/v1/news
  Query: category, severity, source_platform, min_trust_score,
         latitude, longitude, radius_km, search, limit, offset
  Response: { items: NewsArticle[], total: number }
```

**Blocking Status:** Blocked until backend implements news aggregation API.

---

### 6.2 News Store Integration
**File:** `frontend/src/store/newsStore.ts`

| Task | Status | Notes |
|------|--------|-------|
| Replace DUMMY_NEWS with API call | ❌ | Blocked |
| Add background refresh | ⬜ | Can prepare |
| Add location-based filtering | ⬜ | Frontend ready |
| Add search functionality | ✅ | Already works |

---

### 6.3 Alert Page Integration
**File:** `frontend/src/pages/patient/Alerts.tsx`

| Task | Status | Notes |
|------|--------|-------|
| Fetch from `GET /alerts` | ⬜ | Endpoint exists |
| Filter to patient-relevant | ⬜ | By location/severity |
| Add severity sorting | ⬜ | Frontend logic |
| Add location filtering | ⬜ | Use GPS |
| Add pull-to-refresh | ⬜ | Standard pattern |

---

## Phase 7: Offline Support

### 7.1 IndexedDB Schema
**File:** `frontend/src/services/offlineStorage.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Define database schema | ⬜ | See schema below |
| Create migration system | ⬜ | Version upgrades |
| Add CRUD operations | ⬜ | Generic methods |
| Add sync status tracking | ⬜ | synced/pending flags |

**Schema:**
```typescript
const DB_CONFIG = {
  name: 'tmt-offline',
  version: 1,
  stores: {
    pending_sos: { keyPath: 'id', indexes: ['timestamp', 'synced'] },
    cached_profile: { keyPath: 'patient_id' },
    cached_medical_records: { keyPath: 'id', indexes: ['patient_id'] },
    cached_alerts: { keyPath: 'id', indexes: ['created_at'] },
    pending_location_updates: { keyPath: 'id', indexes: ['timestamp'] },
    pending_status_updates: { keyPath: 'id', indexes: ['timestamp'] },
  }
};
```

---

### 7.2 Background Sync Service
**File:** `frontend/src/services/syncService.ts` (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Implement sync queue logic | ⬜ | Process pending items |
| Add conflict resolution | ⬜ | Server wins by default |
| Add sync status notifications | ⬜ | Toast on sync complete |
| Add retry with backoff | ⬜ | 3 attempts max |
| Add periodic sync trigger | ⬜ | Every 30s when online |

---

### 7.3 Service Worker Enhancement
**File:** `frontend/public/sw.js` or Workbox config

| Task | Status | Notes |
|------|--------|-------|
| Add API response caching | ⬜ | Cache GET responses |
| Add background sync for SOS | ⬜ | Workbox BackgroundSync |
| Add push notification handler | ⬜ | Show notifications |
| Add offline page fallback | ⬜ | Show cached app |

---

## Phase 8: Testing & QA

### 8.1 Unit Tests

| Test Suite | Status | Coverage Target |
|------------|--------|-----------------|
| api.ts (enhanced) | ⬜ | 90% |
| sosStore.ts | ⬜ | 90% |
| authStore.ts integration | ⬜ | 80% |
| socketService.ts | ⬜ | 80% |
| offlineStorage.ts | ⬜ | 85% |
| syncService.ts | ⬜ | 85% |
| errorService.ts | ⬜ | 90% |

### 8.2 Integration Tests

| Test | Status | Notes |
|------|--------|-------|
| Full SOS flow (online) | ⬜ | Trigger → API → Response |
| Full SOS flow (offline→online) | ⬜ | Queue → Sync → Success |
| Auth flow | ⬜ | Login → Token → Persist |
| WebSocket connection | ⬜ | Connect → Join → Events |
| Profile CRUD | ⬜ | Read → Update → Verify |

### 8.3 E2E Tests

| Test | Status | Notes |
|------|--------|-------|
| Patient journey | ⬜ | Register → SOS → Profile |
| Responder journey | ❌ | Blocked on backend |
| Hospital dashboard | ⬜ | Login → View → Update |

---

## Backend Endpoints Needed (Not Yet Implemented)

### Priority 1: Field Responder Dispatch

```typescript
// Responder endpoints
GET  /api/v1/responders/me                    // Current responder profile
GET  /api/v1/responders/me/case               // Active assigned case
PUT  /api/v1/responders/me/case/status        // Update case status
POST /api/v1/responders/me/location           // Update responder location
PUT  /api/v1/responders/me/duty               // Toggle duty status
GET  /api/v1/responders/me/history            // Case history

// WebSocket events
case_assigned, case_updated, case_cancelled
```

### Priority 2: News Aggregation

```typescript
GET /api/v1/news                              // List articles with filters
GET /api/v1/news/{id}                         // Article detail
GET /api/v1/news/nearby                       // Location-based news
POST /api/v1/news/{id}/report                 // Report false info
```

### Priority 3: Push Notifications

```typescript
POST /api/v1/users/me/push-token              // Register FCM token
DELETE /api/v1/users/me/push-token            // Unregister token
PUT /api/v1/users/me/notification-settings    // Notification preferences
```

### Priority 4: Photo Attachments

```typescript
POST /api/v1/sos/{sos_id}/attachments         // Upload incident photo
GET /api/v1/sos/{sos_id}/attachments          // List attachments
```

---

## Dependencies Graph

```
Phase 1 (Infrastructure) ───┬──▶ Phase 2 (Auth)
                            │
                            └──▶ Phase 3 (SOS)
                                     │
                                     ▼
Phase 4 (Real-time) ◀───────────────┘
         │
         ├──▶ Phase 5 (Responder) [BLOCKED on backend]
         │
         └──▶ Phase 6 (News) [BLOCKED on backend]

Phase 7 (Offline) ◀─── Requires Phase 1, 3

Phase 8 (Testing) ◀─── All phases
```

---

## Quick Commands

```bash
# Run frontend tests
cd frontend && npm test

# Run backend tests
cd backend && pytest

# Start dev environment
docker-compose up -d

# Check test coverage
cd frontend && npm run test:coverage
```

---

## Progress Summary

| Phase | Tasks | Completed | Blocked |
|-------|-------|-----------|---------|
| Phase 1: Infrastructure | 6 | 0 | 0 |
| Phase 2: Authentication | 7 | 0 | 0 |
| Phase 3: SOS Features | 10 | 0 | 0 |
| Phase 4: Real-time | 8 | 0 | 1 |
| Phase 5: Responder | 6 | 0 | 6 |
| Phase 6: News & Alerts | 6 | 0 | 3 |
| Phase 7: Offline | 6 | 0 | 0 |
| Phase 8: Testing | 3 | 0 | 0 |
| **Total** | **52** | **0** | **10** |

**Overall Progress:** 0%
**Blocked Tasks:** 10 (waiting on backend)

---

*Last Updated: 2026-02-16*
