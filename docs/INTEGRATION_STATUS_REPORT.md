# TMT Mobile App - Backend Integration Status Report

**Generated:** 2026-02-16
**Status:** Final Integration Analysis

---

## Executive Summary

The TMT mobile app has **partial backend integration**. Core features (authentication, SOS, patient profile) are already connected to the backend API. However, several features currently use demo/dummy data because the corresponding backend endpoints either don't exist or aren't fully implemented.

---

## Integration Status Overview

| Feature | Status | Backend Endpoint | Notes |
|---------|--------|------------------|-------|
| Login | ✅ CONNECTED | `/api/v1/auth/login` | Fully functional |
| Patient Registration | ✅ CONNECTED | `/api/v1/patients` | Fully functional |
| Hospital Registration | ✅ CONNECTED | `/api/v1/hospitals` | Fully functional |
| Patient Profile | ✅ CONNECTED | `/api/v1/patients/{id}` | GET/PUT working |
| SOS Creation | ✅ CONNECTED | `/api/v1/sos` | With offline queue |
| SOS History | ✅ CONNECTED | `/api/v1/patients/{id}/sos` | Fully functional |
| Alerts List | ⚠️ PARTIAL | `/api/v1/alerts` | API exists but UI shows demo data |
| Hospital List | ✅ CONNECTED | `/api/v1/hospitals` | Fully functional |
| Responder Cases | ❌ DEMO ONLY | N/A | No backend endpoint |
| News Feed | ❌ DEMO ONLY | N/A | No backend endpoint |
| Push Notifications | ❌ NOT CONNECTED | N/A | Token registration missing |

---

## Detailed Analysis

### 1. FULLY CONNECTED FEATURES

#### 1.1 Authentication (Login)
**File:** `frontend/src/pages/Login.tsx`
**Endpoint:** `POST /api/v1/auth/login`
**Status:** ✅ Fully Connected

```typescript
// Line 44-55: API call implementation
const res = await fetch(`${API_URL}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone, password }),
});
```

- JWT token stored in localStorage
- Role-based navigation after login
- Proper error handling

---

#### 1.2 Patient Registration
**File:** `frontend/src/pages/patient/Register.tsx`
**Endpoint:** `POST /api/v1/patients`
**Status:** ✅ Fully Connected

```typescript
// Line 412: Uses registerPatient from api.ts
const registerResult = await registerPatient(registrationData);
```

Features implemented:
- 4-step registration wizard
- GPS location selection
- Medical profile (conditions, medications, blood type)
- Emergency contacts
- Auto-login after registration
- SMS encryption key storage for offline SOS

---

#### 1.3 Patient Profile
**File:** `frontend/src/pages/patient/Profile.tsx`
**Endpoints:**
- `GET /api/v1/patients/{id}`
- `PUT /api/v1/patients/{id}`
- `GET /api/v1/patients/{id}/sos`
- `GET /api/v1/patients/{id}/records`

**Status:** ✅ Fully Connected

---

#### 1.4 SOS System
**File:** `frontend/src/pages/patient/SOS.tsx`
**Endpoint:** `POST /api/v1/sos`
**Status:** ✅ Fully Connected

Advanced features implemented:
- Real-time GPS tracking
- Offline SOS queue with IndexedDB
- SMS fallback with AES-128-GCM encryption
- Auto-retry when connection restores
- AI-powered severity assessment

---

#### 1.5 Alerts (Partial)
**File:** `frontend/src/pages/patient/Alerts.tsx`
**Endpoint:** `GET /api/v1/alerts`
**Status:** ⚠️ API Connected but Demo Data Displayed

The Alerts page:
- **DOES** call the backend API (lines 325-328)
- **DOES** fetch real alerts from the server
- **BUT** displays `DEMO_CRISIS_ALERTS` and `DEMO_HOSPITAL_NEEDS` instead (line 445)

```typescript
// Line 325-328: API calls exist
const [alertsData, hospitalsData] = await Promise.all([
  getAlerts({ limit: 50 }),
  getHospitals(),
]);

// Line 445: But demo data is displayed instead
const displayAlerts: Alert[] = mainTab === "alerts" ? DEMO_CRISIS_ALERTS : DEMO_HOSPITAL_NEEDS;
```

**Action Required:** Change line 445 to use `alerts` state instead of demo data:
```typescript
const displayAlerts: Alert[] = mainTab === "alerts" ? alerts : alerts.filter(a => a.event_type === 'blood_donation' || a.event_type === 'supplies_needed');
```

---

### 2. DEMO-ONLY FEATURES (No Backend Endpoint)

#### 2.1 Field Responder System
**File:** `frontend/src/store/responderStore.ts`
**Status:** ❌ Demo Data Only

The responder system uses hardcoded demo cases:
- `DEMO_AMBULANCE_CASE` (lines 53-99)
- `DEMO_POLICE_CASE` (lines 101-144)
- `DEMO_CIVIL_DEFENSE_CASE` (lines 146-190)
- `DEMO_FIREFIGHTER_CASE` (lines 192-237)

**Missing Backend Endpoints:**
```
GET  /api/v1/responders/me/case      - Get assigned case
PUT  /api/v1/responders/me/status    - Update responder status
PUT  /api/v1/responders/case/accept  - Accept assigned case
PUT  /api/v1/responders/case/arrived - Mark arrival on scene
PUT  /api/v1/responders/case/complete - Complete case
POST /api/v1/responders/location     - Update GPS location
```

---

#### 2.2 News Feed
**File:** `frontend/src/store/newsStore.ts`
**Status:** ❌ Demo Data Only

Uses `DUMMY_NEWS` from `dummyNewsData.ts` (line 149):
```typescript
store.setArticles(DUMMY_NEWS);
```

**Missing Backend Endpoints:**
```
GET /api/v1/news                    - Get news articles
GET /api/v1/news/{id}               - Get article details
GET /api/v1/news/nearby?lat=&lng=   - Get location-based news
```

---

### 3. NOT YET IMPLEMENTED

#### 3.1 Push Notifications
**Status:** ❌ Not Connected

The native push service exists (`frontend/src/native/pushService.ts`) but:
- No endpoint to register FCM/APNs tokens
- No server-side push notification infrastructure

**Missing Backend Endpoints:**
```
POST /api/v1/push/register          - Register device token
POST /api/v1/push/unregister        - Unregister device token
```

---

#### 3.2 Photo Attachments for SOS
**Status:** ❌ Not Implemented

Backend has no multipart file upload for SOS photos.

**Missing Backend Endpoint:**
```
POST /api/v1/sos/{id}/attachments   - Upload photo/media
```

---

## Backend API Reference

### Available Endpoints (from backend routes)

| Category | Endpoint | Method | Status |
|----------|----------|--------|--------|
| **Auth** | `/auth/login` | POST | ✅ Used |
| **Patients** | `/patients` | POST | ✅ Used |
| | `/patients` | GET | ✅ Used |
| | `/patients/{id}` | GET | ✅ Used |
| | `/patients/{id}` | PUT | ✅ Used |
| | `/patients/{id}/records` | GET | ✅ Used |
| | `/patients/{id}/sos` | GET | ✅ Used |
| | `/patients/{id}/nearest-hospital` | GET | Available |
| | `/patients/{id}/location` | POST | Available |
| **Hospitals** | `/hospitals` | POST | ✅ Used |
| | `/hospitals` | GET | ✅ Used |
| | `/hospitals/{id}` | GET | Available |
| | `/hospitals/{id}/status` | PUT | Dashboard only |
| | `/hospitals/{id}/profile` | PUT | Dashboard only |
| **SOS** | `/sos` | POST | ✅ Used |
| | `/sos` | GET | Dashboard only |
| | `/sos/{id}/status` | PUT | Dashboard only |
| **Alerts** | `/alerts` | GET | ⚠️ Partial |
| | `/alerts/{id}` | GET | Available |
| | `/alerts/{id}/acknowledge` | PUT | Available |
| **Analytics** | `/analytics/stats` | GET | Dashboard only |
| | `/analytics/heatmap` | GET | Dashboard only |
| **Map** | `/map/events` | GET | Dashboard only |
| | `/map/clusters` | GET | Dashboard only |
| **SMS** | `/sms/inbound` | POST | ✅ Used (backend) |
| **Aid Requests** | `/aid-requests` | GET/POST | Dashboard only |

---

## Recommendations

### Immediate Fixes (No Backend Changes Needed)

1. **Alerts Page:** Replace demo data with API data
   - File: `frontend/src/pages/patient/Alerts.tsx`
   - Change line 445 to use real `alerts` state

### Backend Endpoints Needed

1. **Responder Dispatch API** (Priority: High)
   - Required for field responder mobile apps
   - Includes case assignment, status updates, GPS tracking

2. **News API** (Priority: Medium)
   - Aggregate verified news from Telegram channels
   - Trust score integration

3. **Push Notification Registration** (Priority: High)
   - FCM/APNs token storage
   - Topic subscription management

4. **Media Upload for SOS** (Priority: Low)
   - Photo/video attachments
   - Secure pre-signed URL uploads

---

## File References

| Component | File Path |
|-----------|-----------|
| API Service | `frontend/src/services/api.ts` |
| Auth Store | `frontend/src/store/authStore.ts` |
| Responder Store | `frontend/src/store/responderStore.ts` |
| News Store | `frontend/src/store/newsStore.ts` |
| Login Page | `frontend/src/pages/Login.tsx` |
| Register Page | `frontend/src/pages/patient/Register.tsx` |
| SOS Page | `frontend/src/pages/patient/SOS.tsx` |
| Profile Page | `frontend/src/pages/patient/Profile.tsx` |
| Alerts Page | `frontend/src/pages/patient/Alerts.tsx` |

---

## Conclusion

**Connected: 6 features** (Login, Registration, Profile, SOS, Hospitals, Alerts API)
**Demo Only: 2 features** (Responder Cases, News)
**Not Implemented: 2 features** (Push Notifications, Photo Attachments)

The mobile app's core patient-facing features are fully integrated with the backend. The responder-facing features and news feed require new backend endpoints to be implemented before they can be connected.

---

*Report generated by TMT Integration Analysis*
