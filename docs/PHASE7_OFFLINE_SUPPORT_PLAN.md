# Phase 7: Offline Support - Implementation Plan

**Document Version:** 1.0
**Date:** 2026-02-19
**Status:** In Progress
**Author:** TMT Engineering Team

---

## Executive Summary

Phase 7 completes the TMT mobile app's offline support capabilities. Currently at 80% completion, this phase requires implementing **Profile Caching** and **Service Worker** enhancements to provide a fully offline-capable emergency response application.

### Current State
| Component | Status | Notes |
|-----------|--------|-------|
| IndexedDB Schema | ✅ Complete | SOS queue persistence |
| Sync Service | ✅ Complete | Auto-sync on reconnect |
| Profile Caching | ⬜ Not Started | Required |
| Service Worker | ⬜ Partial | Needs fixes and enhancements |

### Target Outcome
- Full offline profile access for emergency scenarios
- Background sync for pending operations
- Optimized caching with proper versioning
- 100% test coverage for offline features

---

## Technical Architecture

### Design Principles (SOLID)

1. **Single Responsibility Principle (SRP)**
   - `ProfileCacheService`: Manages IndexedDB profile storage only
   - `SyncService`: Handles background synchronization only
   - `OfflineStore`: Manages offline state only

2. **Open/Closed Principle (OCP)**
   - Cache strategies configurable without modifying core logic
   - Extensible for new data types (alerts, news, etc.)

3. **Liskov Substitution Principle (LSP)**
   - All cache services implement `ICacheService` interface
   - Storage providers interchangeable (IndexedDB, localStorage)

4. **Interface Segregation Principle (ISP)**
   - `IReadableCache`: Read operations only
   - `IWritableCache`: Write operations only
   - `ISyncableCache`: Sync-specific operations

5. **Dependency Inversion Principle (DIP)**
   - Services depend on abstractions, not concrete implementations
   - Storage backend injectable for testing

---

## Implementation Tasks

### Task 1: IndexedDB Database Consolidation

**Priority:** Critical
**Estimated Effort:** 2 hours

**Problem:** Current codebase has database naming conflict:
- `sosDispatcher.ts` uses `tmt-sos-queue`
- `sw.js` uses `tmt_offline`

**Solution:** Consolidate to unified database schema.

```typescript
// Database Configuration
const DB_CONFIG = {
  name: 'tmt-offline-db',
  version: 2,
  stores: {
    pendingSOS: { keyPath: 'messageId', indexes: ['createdAt', 'status'] },
    profiles: { keyPath: 'id', indexes: ['updatedAt', 'syncStatus'] },
    medicalRecords: { keyPath: 'id', indexes: ['patientId', 'type'] },
    emergencyContacts: { keyPath: 'id', indexes: ['patientId'] },
    hospitals: { keyPath: 'id', indexes: ['updatedAt'] },
    syncQueue: { keyPath: 'id', indexes: ['operation', 'createdAt'] }
  }
};
```

**Files to Modify:**
- `frontend/src/services/sosDispatcher.ts`
- `frontend/public/sw.js`

**Files to Create:**
- `frontend/src/services/offlineDB.ts` (Centralized DB management)

---

### Task 2: Profile Cache Service

**Priority:** High
**Estimated Effort:** 4 hours

**Interface Definition:**

```typescript
interface IProfileCacheService {
  // Read operations
  getProfile(id: string): Promise<CachedProfile | null>;
  getMedicalRecords(patientId: string): Promise<MedicalRecord[]>;
  getEmergencyContacts(patientId: string): Promise<EmergencyContact[]>;

  // Write operations
  cacheProfile(profile: Patient): Promise<void>;
  cacheMedicalRecords(patientId: string, records: MedicalRecord[]): Promise<void>;
  cacheEmergencyContacts(patientId: string, contacts: EmergencyContact[]): Promise<void>;

  // Sync operations
  markForSync(id: string, operation: SyncOperation): Promise<void>;
  getPendingSyncs(): Promise<SyncQueueItem[]>;
  clearSyncedItem(id: string): Promise<void>;

  // Cache management
  isExpired(id: string): Promise<boolean>;
  invalidate(id: string): Promise<void>;
  clear(): Promise<void>;
}

interface CachedProfile extends Patient {
  _cachedAt: number;
  _expiresAt: number;
  _syncStatus: 'synced' | 'pending' | 'conflict';
  _version: number;
}
```

**Cache Expiration Strategy:**
- Profile data: 24 hours
- Medical records: 7 days
- Emergency contacts: 24 hours
- Hospital list: 12 hours

**Files to Create:**
- `frontend/src/services/profileCacheService.ts`
- `frontend/src/types/cache.ts`

---

### Task 3: Profile Store with Offline Support

**Priority:** High
**Estimated Effort:** 3 hours

**Zustand Store Design:**

```typescript
interface ProfileState {
  // Data
  profile: Patient | null;
  medicalRecords: MedicalRecord[];
  emergencyContacts: EmergencyContact[];

  // Status
  isLoading: boolean;
  isOffline: boolean;
  lastSyncedAt: number | null;
  syncStatus: 'idle' | 'syncing' | 'error';

  // Actions
  loadProfile: (patientId: string) => Promise<void>;
  updateProfile: (updates: Partial<Patient>) => Promise<void>;
  addEmergencyContact: (contact: EmergencyContact) => Promise<void>;
  removeEmergencyContact: (contactId: string) => Promise<void>;
  syncWithServer: () => Promise<void>;

  // Cache management
  loadFromCache: (patientId: string) => Promise<boolean>;
  saveToCache: () => Promise<void>;
}
```

**Offline-First Loading Strategy:**
1. Check IndexedDB cache first
2. Return cached data immediately if available
3. Fetch from server in background
4. Update cache and UI if new data received
5. Handle conflicts with version comparison

**Files to Create:**
- `frontend/src/store/profileStore.ts`

**Files to Modify:**
- `frontend/src/pages/patient/Profile.tsx` (Use new store)

---

### Task 4: Service Worker Enhancement

**Priority:** High
**Estimated Effort:** 4 hours

**Current Issues:**
1. Database name mismatch with main app
2. No background sync registration trigger
3. Incomplete cache strategy for API responses
4. Missing offline UI feedback

**Enhanced Service Worker Features:**

```javascript
// Cache Strategies
const CACHE_STRATEGIES = {
  'static': 'cache-first',      // CSS, JS, images
  'api-readonly': 'stale-while-revalidate',  // GET /patients, /hospitals
  'api-write': 'network-only',   // POST, PUT, DELETE
  'critical': 'network-first'    // SOS, auth
};

// API Endpoint Caching Rules
const API_CACHE_RULES = {
  '/api/v1/hospitals': { strategy: 'stale-while-revalidate', maxAge: 3600 },
  '/api/v1/patients/*/profile': { strategy: 'stale-while-revalidate', maxAge: 86400 },
  '/api/v1/alerts': { strategy: 'network-first', maxAge: 300 },
  '/api/v1/sos': { strategy: 'network-only' }
};
```

**Background Sync Implementation:**

```javascript
// In sosDispatcher.ts - Register sync
async storePendingSOS(payload: SOSPayload): Promise<void> {
  await this.storeInIndexedDB(payload);

  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('sync-sos');
  }
}

// In sw.js - Handle sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sos') {
    event.waitUntil(syncPendingSOS());
  } else if (event.tag === 'sync-profile') {
    event.waitUntil(syncPendingProfiles());
  }
});
```

**Files to Modify:**
- `frontend/public/sw.js`
- `frontend/src/services/sosDispatcher.ts`

**Files to Create:**
- `frontend/src/services/swRegistration.ts` (SW lifecycle management)

---

### Task 5: Offline State Management

**Priority:** Medium
**Estimated Effort:** 2 hours

**Offline Store Design:**

```typescript
interface OfflineState {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
  pendingSyncCount: number;
  lastOnlineAt: number | null;

  // Actions
  setOnlineStatus: (isOnline: boolean) => void;
  checkConnection: () => Promise<void>;
  getPendingOperations: () => Promise<number>;
}
```

**Network Detection:**
- Use Navigator.onLine API
- Ping health endpoint for true connectivity
- Listen to online/offline events
- Capacitor Network plugin for native apps

**Files to Create:**
- `frontend/src/store/offlineStore.ts`
- `frontend/src/components/OfflineIndicator.tsx`

---

### Task 6: Vite PWA Plugin Integration

**Priority:** Medium
**Estimated Effort:** 2 hours

**Configuration:**

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'TMT Emergency Response',
        short_name: 'TMT',
        theme_color: '#dc2626',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [/* ... */]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.tmt\.app\/api\/v1\/hospitals/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-hospitals', expiration: { maxAgeSeconds: 3600 } }
          }
        ]
      }
    })
  ]
});
```

**Files to Modify:**
- `frontend/vite.config.ts`
- `frontend/package.json` (Add vite-plugin-pwa dependency)

---

## Testing Strategy

### Unit Tests

**Profile Cache Service Tests:**
```typescript
describe('ProfileCacheService', () => {
  describe('cacheProfile', () => {
    it('should store profile with metadata');
    it('should update existing profile');
    it('should set correct expiration time');
  });

  describe('getProfile', () => {
    it('should return cached profile');
    it('should return null for expired profile');
    it('should return null for non-existent profile');
  });

  describe('sync operations', () => {
    it('should mark profile for sync');
    it('should return pending syncs');
    it('should clear synced items');
  });
});
```

**Offline Store Tests:**
```typescript
describe('useOfflineStore', () => {
  it('should track online/offline status');
  it('should count pending operations');
  it('should update on network events');
});
```

### Integration Tests

**Profile Store Integration:**
```typescript
describe('ProfileStore Integration', () => {
  it('should load from cache when offline');
  it('should update cache after server fetch');
  it('should handle optimistic updates');
  it('should resolve sync conflicts');
});
```

**Service Worker Tests:**
```typescript
describe('Service Worker', () => {
  it('should cache static assets on install');
  it('should serve cached content when offline');
  it('should trigger background sync for SOS');
  it('should handle API caching correctly');
});
```

### End-to-End Tests

```typescript
describe('Offline Support E2E', () => {
  it('should display profile when offline');
  it('should queue SOS and sync when online');
  it('should show offline indicator');
  it('should update UI after sync');
});
```

---

## File Structure

```
frontend/src/
├── services/
│   ├── offlineDB.ts              # Centralized IndexedDB management
│   ├── profileCacheService.ts    # Profile caching logic
│   ├── syncService.ts            # Background sync coordination
│   └── swRegistration.ts         # Service worker lifecycle
├── store/
│   ├── profileStore.ts           # Profile state with offline support
│   └── offlineStore.ts           # Offline state management
├── components/
│   └── OfflineIndicator.tsx      # Offline status UI
├── types/
│   └── cache.ts                  # Cache-related type definitions
└── __tests__/
    ├── services/
    │   ├── offlineDB.test.ts
    │   ├── profileCacheService.test.ts
    │   └── syncService.test.ts
    ├── store/
    │   ├── profileStore.test.ts
    │   └── offlineStore.test.ts
    └── integration/
        └── offline.integration.test.ts

frontend/public/
└── sw.js                         # Enhanced service worker
```

---

## Implementation Order

1. **Day 1: Foundation**
   - [ ] Create `offlineDB.ts` with unified schema
   - [ ] Update `sosDispatcher.ts` to use new DB
   - [ ] Update `sw.js` to use matching DB name
   - [ ] Write tests for offlineDB

2. **Day 2: Profile Caching**
   - [ ] Implement `profileCacheService.ts`
   - [ ] Create cache types in `cache.ts`
   - [ ] Write unit tests for cache service
   - [ ] Implement `profileStore.ts`

3. **Day 3: Service Worker**
   - [ ] Enhance `sw.js` with proper caching
   - [ ] Implement background sync triggers
   - [ ] Create `swRegistration.ts`
   - [ ] Write SW tests

4. **Day 4: Integration & Polish**
   - [ ] Create `offlineStore.ts`
   - [ ] Implement `OfflineIndicator.tsx`
   - [ ] Integration testing
   - [ ] Bug fixes and optimization

---

## Success Criteria

- [ ] Profile data accessible offline within 100ms
- [ ] SOS queue syncs automatically via background sync
- [ ] Service worker serves cached content when offline
- [ ] All unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] No IndexedDB errors in production
- [ ] Offline indicator shows correct status
- [ ] Cache expires and refreshes correctly

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| IndexedDB quota exceeded | Implement LRU eviction, limit cache size |
| Sync conflicts | Version-based conflict resolution |
| Stale cache served | Configurable TTL, force refresh option |
| SW update issues | Proper versioning, skip waiting strategy |

---

## Appendix: API Endpoints Used

| Endpoint | Cache Strategy | TTL |
|----------|---------------|-----|
| GET /patients/{id} | Stale-While-Revalidate | 24h |
| GET /patients/{id}/records | Stale-While-Revalidate | 7d |
| GET /hospitals | Stale-While-Revalidate | 12h |
| POST /sos | Network-Only + Queue | N/A |
| GET /alerts | Network-First | 5m |

---

*Document maintained by TMT Engineering Team*
