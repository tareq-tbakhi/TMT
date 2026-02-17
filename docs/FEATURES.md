# TMT System — Feature Specification

> **Version:** 1.1.0
> **Date:** 2026-02-17
> **Team:** Wael · Tareq · Mahmoud · Leen · Roa

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Stakeholder Types](#2-stakeholder-types)
3. [Feature Modules](#3-feature-modules)
4. [Implementation Status & Gap Analysis](#4-implementation-status--gap-analysis)
5. [Task Assignments](#5-task-assignments)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Pitch Summary](#7-pitch-summary)

---

## 1. Project Overview

**TMT (Triage & Monitor for Threats)** is a dual-platform emergency response system that connects citizens in crisis with the right response teams, delivers AI-powered situational awareness to all stakeholders, and maintains communication even when infrastructure fails.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile App | React Native (iOS & Android) |
| Web Dashboard | React 19 + Vite + Tailwind CSS |
| Backend API | Python FastAPI + PostgreSQL + PostGIS |
| Real-Time | Socket.IO (WebSocket) |
| Async Tasks | Celery + Redis |
| AI Engine | CrewAI + GLM-5 (Zhipu AI) + LiteLLM |
| Vector Search | Qdrant + sentence-transformers (all-MiniLM-L6-v2) |
| Geospatial | PostGIS + GeoAlchemy2 + Shapely |
| Messaging | Twilio (SMS) · Telethon (Telegram) |
| Auth | JWT (HS256) + RBAC |

---

## 2. Stakeholder Types

| Role | Platform | Description |
|------|----------|-------------|
| **Super Admin** (وزارة الصحة) | Web + Mobile | Ministry-level oversight — full system visibility |
| **Hospital Admin** | Web + Mobile | Hospital operations, patient intake, resource requests |
| **Civil Defence Admin** | Web + Mobile | Rescue coordination, resource deployment |
| **Police Admin** | Web + Mobile | Security incident management |
| **Ambulance Driver** | Mobile (Field) | Active case navigation and status updates |
| **Police Officer** | Mobile (Field) | Field security response |
| **Civil Defence Responder** | Mobile (Field) | Field rescue operations |
| **Firefighter** | Mobile (Field) | Field fire/rescue operations |
| **Patient / Citizen** | Mobile | SOS submission, news feed, request viewer |

---

## 3. Feature Modules

---

### Module 1 — User Registration & Medical Profile

> **Platform:** Mobile (Patient/Citizen)
> **Backend Status:** ✅ Complete (patient model, records API)
> **Frontend Status:** ⚠️ Partial (Register page exists, full flow incomplete)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1.1 | Citizen Registration | Phone number registration with OTP verification | ⚠️ Partial |
| 1.2 | Medical Record Entry | Blood type, chronic conditions, allergies, medications | ✅ Backend ready |
| 1.3 | Special Needs Flagging | Mobility impairment, respiratory conditions, disabilities | ✅ Backend ready |
| 1.4 | Emergency Contacts | Up to 3 contacts notified automatically on SOS | ✅ Backend ready |
| 1.5 | Living Situation | Alone/with family/elderly — feeds into AI priority scoring | ✅ Backend ready |
| 1.6 | Profile Management | Edit personal and medical information at any time | ⚠️ Partial |

---

### Module 2 — SOS Emergency System

> **Platform:** Mobile (Patient)
> **Backend Status:** ✅ Operational
> **Frontend Status:** ✅ Core complete, AI conversation partial

#### 2.1 SOS Trigger

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 2.1.1 | One-Tap SOS Button | Large, always-visible SOS button on the home screen | ✅ |
| 2.1.2 | 5-Second Cancel Window | Cancel countdown before SOS is transmitted | ✅ |
| 2.1.3 | GPS Auto-Capture | Location captured immediately on trigger | ✅ |
| 2.1.4 | Offline Queuing | SOS stored in IndexedDB when offline, synced on reconnect | ✅ |
| 2.1.5 | WebSocket Broadcast | Real-time notification to all relevant stakeholders | ✅ |

#### 2.2 AI-Assisted Triage Conversation

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 2.2.1 | Conversational Triage UI | AI chat screen after SOS trigger | ✅ UI ready |
| 2.2.2 | Voice Input | Voice-activated responses with waveform animation | ✅ UI ready |
| 2.2.3 | Quick-Tap Options | Pre-defined response chips for fast one-tap answers | ✅ |
| 2.2.4 | Text Input | Manual text entry mode | ✅ |
| 2.2.5 | Photo Attachment | Attach situational photos to the SOS | ✅ |
| 2.2.6 | Unresponsive Auto-Send | Auto-submit with patient profile data after 30s no response | ✅ |
| 2.2.7 | Partial Response Handling | Submit whatever data was collected if conversation stops | ✅ |
| 2.2.8 | Low Battery Mode | Expedited 2-question flow when battery < 15% | ✅ |
| 2.2.9 | Urgency Keyword Detection | Immediate send on "help now", "dying", etc. | ✅ |
| 2.2.10 | Panic Detection | Simplified mode triggered by panicked input patterns | ⬜ Planned |
| 2.2.11 | Urgent Call Button | Always-visible red button for direct operator connection | ✅ |
| 2.2.12 | Conversation Storage | Full transcript saved per SOS for responder review | ⚠️ Partial |
| 2.2.13 | LLM Dynamic Responses | Replace hardcoded flow with live LLM-driven conversation | ⬜ Planned |

#### 2.3 SOS Fallback Communication Chain

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 2.3.1 | Layer 1 — Internet | Primary: WebSocket + HTTPS API | ✅ |
| 2.3.2 | Layer 2 — SMS | Encrypted SMS via Twilio when internet unavailable | ⚠️ Partial |
| 2.3.3 | Layer 2 — SMS Auto-Send | Automatic send without user interaction (native permission) | ⬜ Planned |
| 2.3.4 | Layer 2 — SMS Gateway Receive | Backend parses and processes incoming SOS SMS | ✅ |
| 2.3.5 | Layer 2 — SMS Acknowledgment | Backend sends confirmation SMS back to user | ✅ |
| 2.3.6 | Layer 3 — Bluetooth Mesh | Bridgefy SDK peer-to-peer relay when no network/cellular | ⬜ Planned |
| 2.3.7 | Unified Dispatcher | Automatic fallback chain with delivery tracking & deduplication | ⬜ Planned |

#### 2.4 Patient GPS Tracking & Resolution

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 2.4.1 | Live Location Tracking | Continuous GPS broadcast during active SOS | ✅ |
| 2.4.2 | Geofence Auto-Close | SOS auto-deactivated when patient GPS enters hospital perimeter (500m) | ✅ |
| 2.4.3 | Manual Close | Patient or responder can manually close the SOS | ✅ |
| 2.4.4 | Emergency Contact Alerts | Emergency contacts notified on SOS submission | ✅ Backend ready |

---

### Module 3 — News & Crisis Intelligence

> **Platform:** Mobile (all users) + Web dashboard
> **Backend Status:** ✅ Telegram agent active (in branch), partial API
> **Frontend Status:** ✅ UI components ready, awaiting backend integration

#### 3.1 AI News Collection Agent

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 3.1.1 | Telegram Channel Monitoring | Monitor specified channels and extract crisis content via Telethon + GLM-5 | ✅ In branch |
| 3.1.2 | X (Twitter) Integration | Monitor keywords and accounts on X | ⬜ Planned |
| 3.1.3 | Facebook Page Monitoring | Monitor public pages and groups | ⬜ Planned |
| 3.1.4 | Web News Scraping | Crawl news sites for relevant crisis headlines | ⬜ Planned |
| 3.1.5 | Autonomous Source Management | Agent autonomously joins/leaves channels/pages based on relevance and trust | ⬜ Planned |
| 3.1.6 | Vector Semantic Search | Embed news via Qdrant; find similar crisis events across sources | ✅ Active |
| 3.1.7 | Knowledge Gap Detection | Identify regions or crisis types with insufficient coverage | ✅ Active |

#### 3.2 Source Trust Scoring

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 3.2.1 | Per-Source Trust Score | Dynamic 0–100 score per channel, page, or account | ✅ Schema ready |
| 3.2.2 | Historical Accuracy Tracking | Score updated based on past accuracy of the source | ✅ Logic exists |
| 3.2.3 | Engagement Weighting | Engagement patterns raise/lower score | ⚠️ Partial |
| 3.2.4 | Continuous Updates | Trust scores recalculated on each new publication event | ⚠️ Partial |

#### 3.3 News Verification Agent

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 3.3.1 | Cross-Source Validation | Second AI agent validates news by cross-referencing multiple sources | ⚠️ Task exists, agent not built |
| 3.3.2 | SOS Correlation | Match news events to live SOS patterns (e.g., flood news + SOS in that area) | ⬜ Planned |
| 3.3.3 | Confidence Score | Each article receives a verification confidence score | ⬜ Planned |
| 3.3.4 | Vector Similarity Matching | Qdrant semantic search to find corroborating reports | ✅ Groundwork ready |
| 3.3.5 | False Report Flagging | Low-confidence articles flagged; user reports feed back into score | ⚠️ Partial |

#### 3.4 News Feed (Mobile)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 3.4.1 | Location-Aware Feed | News within configurable radius of user's location | ✅ UI ready |
| 3.4.2 | Trust Score Badge | Color-coded visual trust indicator per article | ✅ UI ready |
| 3.4.3 | Severity & Category Filtering | Filter by threat/warning/update/info and critical/high/medium/low | ✅ UI ready |
| 3.4.4 | Real-Time Push Updates | WebSocket push for breaking news | ✅ Backend ready |
| 3.4.5 | Article Detail View | Full article with source info, media, trust score | ✅ UI ready |
| 3.4.6 | False Report Button | Users can flag misleading articles | ✅ Backend endpoint exists |

---

### Module 4 — Stakeholder Resource & Transfer Requests

> **Platform:** Web (publish) + Mobile (view/respond)
> **Backend Status:** ⚠️ Partial (APIs exist, partial implementation)
> **Frontend Status:** ⚠️ Partial (UI exists but incomplete)

#### 4.1 Resource Requests (Stakeholder → Public)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 4.1.1 | Blood Donation Request | Hospital publishes blood type needed with urgency level | ⚠️ Partial |
| 4.1.2 | Supply Request | General medical or equipment supply requests | ⚠️ Partial |
| 4.1.3 | Volunteer Request | Request for volunteer responders or staff | ⬜ Planned |
| 4.1.4 | Request Expiry | Requests auto-expire or can be manually closed when fulfilled | ⚠️ Partial |

#### 4.2 Request Viewer (Citizen Mobile)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 4.2.1 | Request Feed | Citizens see active nearby requests from stakeholders | ⬜ Planned |
| 4.2.2 | Request Details | View details, location, urgency, requester | ⬜ Planned |
| 4.2.3 | Respond to Request | Citizens indicate availability or willingness to help | ⬜ Planned |

#### 4.3 Patient Transfer Requests (Hospital → Stakeholders)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 4.3.1 | Create Transfer Request | Hospital publishes request to transfer a patient | ⚠️ Partial |
| 4.3.2 | Transfer Board | Relevant stakeholders (civil defence, ambulance) view open requests | ⚠️ Partial |
| 4.3.3 | Accept Transfer | Unit accepts and begins transport | ⚠️ Partial |
| 4.3.4 | Transfer Timeline | End-to-end tracking from request to completion | ⚠️ Partial |

---

### Module 5 — Field Responder Mobile Views

> **Platform:** Mobile (React Native — to be rebuilt)
> **Status:** ✅ Completed in current web app (Capacitor) — React Native migration pending

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 5.1 | Active Case Card | Real-time assigned case with priority, type, and patient brief | ✅ |
| 5.2 | AI Recommendations | Per-case AI guidance surfaced from patient medical record | ✅ |
| 5.3 | Equipment Checklist | Required equipment list based on case type | ✅ |
| 5.4 | Navigation Map | Route to pickup and destination | ✅ |
| 5.5 | Case Status Flow | Accept → En Route → On Scene → Transporting → Completed | ✅ |
| 5.6 | Standby State | "No active case" screen during downtime | ✅ |
| 5.7 | Case History | Past assigned cases with timestamps and resolution | ✅ |
| 5.8 | Responder Types | Separate views for Ambulance, Police, Civil Defence, Firefighter | ✅ |

> **Doc:** [FIELD_RESPONDER_PLAN.md](../FIELD_RESPONDER_PLAN.md)

---

### Module 6 — Web Dashboard

> **Platform:** Web
> **Backend Status:** ✅ APIs mostly complete
> **Frontend Status:** ✅ Core complete — some tabs partial

#### 6.1 Dashboard Home

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.1.1 | KPI Overview | Active SOS count, dispatched units, resolved cases today | ✅ |
| 6.1.2 | Role-Based View | Dashboard content scoped to stakeholder type | ✅ |
| 6.1.3 | Quick Actions | Shortcuts to most-used functions | ✅ |
| 6.1.4 | Analytics Charts | Response time trends, severity distributions | ✅ |

#### 6.2 Alerts Tab

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.2.1 | Real-Time SOS List | Live-updating list of all active SOS cases | ✅ |
| 6.2.2 | AI Triage Score (0–100) | Priority score per case displayed for responders | ✅ |
| 6.2.3 | Patient Medical Summary | Relevant medical context pulled from patient profile | ✅ |
| 6.2.4 | AI Responder Recommendations | Medication, mobility, equipment highlights per case | ✅ |
| 6.2.5 | Case Assignment | Assign case to specific unit or responder | ✅ |
| 6.2.6 | Status Management | Update case status, add notes | ✅ |
| 6.2.7 | Filters | Filter by severity, type, location radius, status | ✅ |
| 6.2.8 | SOS Detail View | Full case view with triage data, conversation transcript, map | ✅ |

#### 6.3 Live Map

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.3.1 | Active SOS Pins | Real-time pins for all active SOS cases | ✅ |
| 6.3.2 | Severity Color Coding | Red/orange/yellow/blue by severity level | ✅ |
| 6.3.3 | Responder Locations | Live GPS positions of field units | ✅ |
| 6.3.4 | Facility Markers | Hospitals, police stations, civil defence bases | ✅ |
| 6.3.5 | News Event Overlay | Toggle layer for news event locations | ✅ |
| 6.3.6 | Crisis Heatmap | Density visualization of SOS/crisis concentration | ✅ |
| 6.3.7 | Click-to-Detail Panel | Click any pin to open full detail panel | ✅ |
| 6.3.8 | Time Range Filter | Filter map events by time window | ✅ |

#### 6.4 Resource Requests Tab

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.4.1 | Create Request | Publish blood/supply/volunteer requests | ⚠️ Partial |
| 6.4.2 | Request Management | Edit, close, or extend active requests | ⚠️ Partial |
| 6.4.3 | Response Tracking | View who responded to each request | ⬜ Planned |

#### 6.5 Transfer Requests Tab

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.5.1 | Create Transfer | Hospital submits patient transfer request | ⚠️ Partial |
| 6.5.2 | Transfer Board | Other stakeholders view open transfer requests | ⚠️ Partial |
| 6.5.3 | Accept & Track | Accept transfer and track from dispatch to completion | ⚠️ Partial |

#### 6.6 Stakeholder Profile & Settings

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 6.6.1 | Organization Profile | Edit name, location, contact info, coverage zone | ✅ |
| 6.6.2 | Facility Status | Mark as operational / limited capacity / offline | ✅ |
| 6.6.3 | Staff Management | Add/remove sub-accounts, assign roles | ⚠️ Partial |
| 6.6.4 | Notification Preferences | Configure alert types and delivery channels | ⬜ Planned |

---

### Module 7 — AI Prioritization Engine

> **Platform:** Backend
> **Status:** ✅ Core pipeline operational (CrewAI + GLM-5) — advanced features planned

#### 7.1 SOS Priority Scoring

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 7.1.1 | Multi-Factor Score (0–100) | Combines medical record, triage data, location, news context, patient history | ✅ |
| 7.1.2 | Special Needs Weighting | Higher priority for mobility/respiratory/cognitive conditions | ✅ |
| 7.1.3 | Location Danger Context | Nearby confirmed crisis events raise score via vector search | ✅ |
| 7.1.4 | Patient Trust Score | Repeat false alarms reduce priority weighting | ✅ |
| 7.1.5 | Response Urgency Decay | Score increases the longer a case goes unaddressed | ⬜ Planned |

#### 7.2 Responder AI Recommendations

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 7.2.1 | Critical Medication Alerts | Surface key medications from patient medical record | ✅ |
| 7.2.2 | Mobility Status | Flag patients who cannot self-evacuate | ✅ |
| 7.2.3 | Equipment Suggestions | Recommend equipment based on case type and patient profile | ✅ |
| 7.2.4 | Dispatch Suggestions | Recommend nearest or best-fit facility for the case | ✅ |

#### 7.3 Smart Resolution

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 7.3.1 | Hospital Arrival Detection | GPS geofence auto-closes SOS on hospital entry | ✅ |
| 7.3.2 | Duplicate SOS Guard | 5-minute deduplication window per patient | ✅ |
| 7.3.3 | False Alarm Detection | Pattern-based flagging for review | ⬜ Planned |

---

### Module 8 — Vector Intelligence Layer

> **Platform:** Backend (Qdrant)
> **Status:** ✅ Active

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 8.1 | Crisis Event Embeddings | Telegram messages + news articles encoded as 384-dim vectors | ✅ |
| 8.2 | Semantic Similarity Search | Find related crisis reports across sources using cosine distance | ✅ |
| 8.3 | Knowledge Gap Detection | Identify regions/topics with insufficient intelligence coverage | ✅ |
| 8.4 | Event Deduplication | Detect duplicate reports from different sources via vector match | ✅ |
| 8.5 | Context Enrichment for Triage | Pull semantically relevant past events to inform SOS scoring | ✅ |
| 8.6 | Expanding Embeddings | Extend to cover news articles, SOS transcripts, responder notes | ⬜ Planned |

**Stack:** Qdrant v1.7.4 · Collection: `tmt_intelligence` · 384-dim · Cosine distance · sentence-transformers `all-MiniLM-L6-v2`

---

### Module 9 — React Native Mobile App

> **Platform:** iOS & Android
> **Status:** ⬜ Migration planned — current Capacitor build functional as interim

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 9.1 | React Native Project Setup | Initialize RN project, configure navigation and state | ⬜ |
| 9.2 | Patient App Screens | Registration, SOS, News, Profile, Medical Records | ⬜ |
| 9.3 | Field Responder Screens | Rebuild 4 responder views in React Native | ⬜ |
| 9.4 | Push Notifications | Firebase Cloud Messaging integration | ⬜ |
| 9.5 | Background GPS | Continuous location tracking when app is backgrounded | ⬜ |
| 9.6 | Native Camera | High-quality photo capture for SOS attachments | ⬜ |
| 9.7 | Haptic Feedback | Vibration patterns for SOS confirmation | ⬜ |
| 9.8 | Bluetooth Mesh | Bridgefy SDK integration for offline SOS relay | ⬜ |
| 9.9 | Biometric Auth | Face ID / fingerprint for secure quick-login | ⬜ |
| 9.10 | Offline-First Storage | Local SOS queue with background sync | ⬜ |
| 9.11 | Arabic RTL Support | Full right-to-left layout support | ⬜ |

---

### Module 10 — Compliance & Legal

> **Status:** ✅ Documented

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 10.1 | User Consent Form | Arabic + English consent before data collection | ✅ |
| 10.2 | Data Protection Policy | GDPR-aligned data handling and retention | ✅ |
| 10.3 | Audit Trail | All critical operations logged in audit_log table | ✅ |
| 10.4 | Emergency Disclaimer | TMT supplements but does not replace official emergency services | ✅ |
| 10.5 | Data Encryption | Client-side encryption for sensitive payloads | ✅ |

---

### Module 11 — Security & Data Protection

> **Platform:** Full stack
> **Standard:** GDPR · EU Medical Records Standards · NIS2
> **Status:** ✅ Partially implemented — hardening in progress

#### 11.1 Encryption

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11.1.1 | Transport Encryption | TLS 1.3 enforced for all API and WebSocket communication | ✅ |
| 11.1.2 | Medical Record Encryption at Rest | Patient medical data encrypted in the database (AES-256) | ✅ |
| 11.1.3 | SOS Payload Encryption | SOS data encrypted client-side before transmission | ✅ |
| 11.1.4 | SMS Payload Encryption | Encrypted format for SMS fallback messages (AES-256-GCM + HMAC-SHA256) | ✅ |
| 11.1.5 | Bluetooth Mesh Encryption | End-to-end encryption for Bridgefy mesh messages | ⬜ Planned |
| 11.1.6 | Encrypted Local Storage | Sensitive data encrypted before storing on device | ✅ |
| 11.1.7 | Zero-Knowledge Analytics | Patient identifiers pseudonymized in analytics and reporting | ⚠️ Partial |

#### 11.2 Authentication & Access Control

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11.2.1 | JWT Authentication | Short-lived access tokens (24h) with refresh token rotation | ✅ |
| 11.2.2 | Bcrypt Password Hashing | Passwords hashed with bcrypt before storage | ✅ |
| 11.2.3 | Role-Based Access Control | All API endpoints enforce role-based permission checks | ✅ |
| 11.2.4 | Two-Factor Authentication | 2FA option for all admin (stakeholder) accounts | ⬜ Planned |
| 11.2.5 | Session Invalidation | Force-logout and session revocation for compromised accounts | ⬜ Planned |
| 11.2.6 | API Rate Limiting | Per-IP and per-user rate limiting on all endpoints | ⚠️ Partial |

#### 11.3 Data Protection (EU Standards)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11.3.1 | GDPR Consent Management | Explicit consent captured and stored before data collection | ✅ |
| 11.3.2 | Right to Erasure | Patient can request full account and data deletion (GDPR Art. 17) | ⬜ Planned |
| 11.3.3 | Data Portability | Patient can export their full data in machine-readable format (GDPR Art. 20) | ⬜ Planned |
| 11.3.4 | Data Minimization | Only data necessary for the emergency purpose is collected | ✅ |
| 11.3.5 | Retention Policies | Medical records retained per EU health data standards; older data auto-purged | ⚠️ Partial |
| 11.3.6 | Data Residency | Deployment configured to keep EU citizen data within EU infrastructure | ⬜ Planned |
| 11.3.7 | Pseudonymization | Patient IDs decoupled from identifiable data in logs and analytics | ⚠️ Partial |
| 11.3.8 | Breach Notification | Automated alert process for detecting and reporting data breaches (GDPR Art. 33) | ⬜ Planned |

#### 11.4 Audit & Monitoring

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11.4.1 | Comprehensive Audit Log | All reads/writes on sensitive records logged with timestamp, user, action | ✅ |
| 11.4.2 | Admin Action Logging | All stakeholder admin operations recorded | ✅ |
| 11.4.3 | Suspicious Activity Detection | Alert on unusual access patterns (multiple failed logins, bulk exports) | ⬜ Planned |
| 11.4.4 | Security Event Dashboard | Super admin view of security events and access logs | ⬜ Planned |

#### 11.5 Infrastructure Security

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11.5.1 | HTTPS Only | All HTTP traffic redirected to HTTPS | ✅ |
| 11.5.2 | CORS Policy | Strict origin allow-list for browser API access | ✅ |
| 11.5.3 | SQL Injection Protection | SQLAlchemy ORM with parameterized queries throughout | ✅ |
| 11.5.4 | Input Validation | Pydantic schemas enforce strict validation on all inputs | ✅ |
| 11.5.5 | Docker Network Isolation | Services communicate over isolated internal Docker network | ✅ |
| 11.5.6 | Secret Management | Credentials stored in environment variables, never in code | ✅ |
| 11.5.7 | Dependency Scanning | Regular audit of backend and frontend dependencies for CVEs | ⬜ Planned |

---

## 4. Implementation Status & Gap Analysis

### Overall Status Summary

| Module | Backend | Frontend/Mobile | AI/ML | Priority |
|--------|---------|-----------------|-------|----------|
| 1 — User Registration | ✅ Complete | ⚠️ Partial | — | Critical |
| 2.1 — SOS Trigger | ✅ Complete | ✅ Complete | — | ✅ Done |
| 2.2 — AI Triage Conversation | ✅ GLM-5 ready | ✅ UI ready | ✅ Agent built | High |
| 2.3 — SMS Fallback | ✅ Receive ready | ⚠️ Manual only | — | High |
| 2.3 — Bluetooth Mesh | ❌ | ❌ | — | Medium |
| 2.4 — GPS Tracking & Auto-Close | ✅ Complete | ✅ Complete | — | ✅ Done |
| 3.1 — News Collection (Telegram) | ✅ In branch | — | ✅ GLM-5 | High |
| 3.1 — News Collection (Multi-platform) | ❌ | — | ❌ | Medium |
| 3.2 — Trust Scoring | ✅ Schema + logic | ✅ UI displays | ✅ AI-informed | ⚠️ Needs completion |
| 3.3 — News Verification Agent | ⚠️ Task exists | — | ❌ Not built | High |
| 3.4 — News Feed (Mobile) | ⚠️ Basic API | ✅ UI ready | — | High |
| 4 — Resource/Transfer Requests | ⚠️ Partial | ⚠️ Partial | — | Medium |
| 5 — Field Responder Views | ✅ APIs exist | ✅ Complete (Capacitor) | ✅ Recommendations | React Native migration |
| 6.1/6.2 — Dashboard + Alerts | ✅ Complete | ✅ Complete | — | ✅ Done |
| 6.3 — Live Map | ✅ Complete | ✅ Complete | — | ✅ Done |
| 6.4/6.5 — Requests/Transfer (Web) | ⚠️ Partial | ⚠️ Partial | — | Medium |
| 7 — AI Prioritization | ✅ Operational | ✅ Displays | ✅ CrewAI | ✅ Done |
| 8 — Vector Intelligence (Qdrant) | ✅ Active | — | ✅ Active | ✅ Done |
| 9 — React Native Mobile | ❌ | ❌ | — | High |
| 10 — Compliance | ✅ | ✅ | — | ✅ Done |
| 11 — Security & Data Protection | ⚠️ Partial | ⚠️ Partial | — | High |

### Gaps Not Yet Documented

| Missing Feature | Suggested Doc | Priority |
|----------------|---------------|----------|
| Full patient registration flow (RN) | `PATIENT_MOBILE_PLAN.md` | Critical |
| React Native project setup & architecture | `REACT_NATIVE_MIGRATION_PLAN.md` | High |
| News verification agent (design) | `NEWS_VERIFICATION_AGENT_PLAN.md` | High |
| Autonomous source management (design) | Add to news agent doc | Medium |
| Resource/transfer requests (complete spec) | `REQUESTS_FEATURE_PLAN.md` | Medium |
| Web dashboard — Requests & Transfer tabs | Add to web dashboard doc | Medium |

---

## 5. Task Assignments

### Wael — AI & Fullstack

| Task | Module | Priority |
|------|--------|----------|
| Build news verification agent (CrewAI + Qdrant) | 3.3 | High |
| Connect AI triage conversation (frontend ↔ GLM-5 backend) | 2.2 | High |
| SOS triage conversation storage — backend completion | 2.2.12 | High |
| Expand vector embeddings to SOS transcripts + news articles | 8.6 | Medium |
| Security hardening & EU medical data compliance | 11 | Medium |
| False alarm detection logic | 7.3.3 | Medium |
| SOS priority urgency decay logic | 7.1.5 | Low |

### Tareq — Mobile / DevOps

| Task | Module | Priority |
|------|--------|----------|
| React Native project setup & architecture | 9.1 | Critical |
| Patient app screens in React Native (SOS, News, Profile) | 9.2 | High |
| Rebuild field responder views in React Native | 9.3 | High |
| Push notifications (Firebase) | 9.4 | High |
| Background GPS service | 9.5 | High |
| SMS auto-send (native, no user interaction) | 2.3.3 | High |
| Bluetooth Mesh (Bridgefy) | 2.3.6 / 9.8 | Medium |
| CI/CD pipeline | — | Medium |

### Mahmoud — AI & Fullstack

| Task | Module | Priority |
|------|--------|----------|
| Merge Telegram news agent branch to main | 3.1.1 | High |
| Complete trust scoring algorithm | 3.2 | High |
| Multi-platform news expansion (X, Facebook, web scraping) | 3.1.2–3.1.4 | Medium |
| Autonomous source management agent | 3.1.5 | Medium |
| News tab backend — complete API + DB integration | 3.4 | High |
| Complete resource/transfer request APIs | 4 | High |
| Web dashboard — Resource & Transfer tab backend | 6.4 / 6.5 | Medium |
| Staff management API | 6.6.2 | Medium |

### Leen — QA / Frontend

| Task | Module | Priority |
|------|--------|----------|
| Web dashboard — Resource Requests tab (complete UI) | 6.4 | High |
| Web dashboard — Transfer Requests tab (complete UI) | 6.5 | High |
| Web dashboard — Staff management UI | 6.6.2 | Medium |
| Notification preferences settings page | 6.6.4 | Low |
| QA testing — web dashboard (all tabs) | 6 | Ongoing |
| UI review and feedback across all screens | — | Ongoing |

### Roa — QA / Frontend

| Task | Module | Priority |
|------|--------|----------|
| Patient registration full flow (web + React Native handoff) | 1 | Critical |
| News tab frontend — connect to backend API | 3.4 | High |
| Resource requests mobile view (citizen feed) | 4.2 | High |
| AI triage conversation — LLM mode integration | 2.2.13 | High |
| QA testing — SOS flow end-to-end | 2 | Ongoing |
| QA testing — field responder views | 5 | Ongoing |
| QA testing — news feed | 3.4 | Ongoing |

---

## 6. Implementation Roadmap

### Phase 1 — Completion of Core Gaps (Weeks 1–3)

| Task | Owner | Notes |
|------|-------|-------|
| Patient registration full flow | Roa | Critical for any real user testing |
| Complete news tab (frontend ↔ backend) | Roa + Mahmoud | Telegram branch ready to merge |
| News verification agent | Wael | Qdrant groundwork already in place |
| Connect AI triage conversation to GLM-5 | Wael + Roa | UI and backend both ready, need wiring |
| Resource/transfer request completion (web) | Leen + Mahmoud | APIs partially exist |
| Security hardening (rate limiting, 2FA, right to erasure) | Wael | EU compliance gap |

### Phase 2 — React Native Migration (Weeks 3–7)

| Task | Owner | Notes |
|------|-------|-------|
| RN project setup + navigation | Tareq | Define architecture before building |
| Patient app screens (SOS, News, Profile) | Tareq + Roa | Reuse backend APIs, rebuild UI in RN |
| Field responder views (all 4 types) | Tareq | Port logic from Capacitor version |
| Push notifications + background GPS | Tareq | Required for production use |
| SMS auto-send (native) | Tareq | Needs Android/iOS SMS permission flow |

### Phase 3 — Advanced Intelligence (Weeks 6–10)

| Task | Owner | Notes |
|------|-------|-------|
| Multi-platform news (X, Facebook, web scraping) | Mahmoud | Requires API credentials/platform approvals |
| Autonomous source management agent | Mahmoud | Builds on trust scoring completion |
| Expand Qdrant to SOS transcripts | Wael | Improves triage context quality |
| Bluetooth Mesh (Bridgefy) | Tareq | Needs Bridgefy license + native plugin |
| False alarm detection | Wael | Behavioral pattern + history analysis |

---

## 7. Pitch Summary

### The Problem

Emergency response fails when information breaks down:
- Responders arrive without knowing a patient's medical history or special needs
- Dispatch is based on incomplete, unstructured reports
- In disasters, internet and cellular networks collapse — cutting off the primary communication channel
- Crisis information is scattered across social media with no way to filter signal from noise

### Our Solution

TMT is a unified emergency response platform with three core pillars:

**1. Intelligent SOS**
When a citizen presses the SOS button, an AI assistant immediately engages to gather structured triage data — emergency type, injuries, mobility status, people involved. That data, combined with the patient's medical profile, is scored and surfaced to responders within seconds. Responders arrive knowing exactly what to bring and who they are treating.

**2. Resilient Communication**
The SOS signal uses a triple-layer fallback: internet first, then SMS, then Bluetooth mesh (Bridgefy). In a complete blackout, the patient's device relays the SOS peer-to-peer through other nearby devices until it reaches one with connectivity. The signal gets through.

**3. AI Crisis Intelligence**
A multi-agent AI system continuously monitors Telegram channels, social media, and news sources for crisis signals. A collection agent aggregates content; a verification agent cross-validates it against other sources and live SOS patterns. Every source carries a dynamic trust score. The result is a real-time, geospatially-aware intelligence feed that stakeholders can act on.

**4. Security-First, EU Standards**
All medical records are encrypted at rest and in transit. SOS and SMS payloads are encrypted client-side before they leave the device. The system follows EU health data standards — GDPR consent management, data minimization, the right to erasure, and a full audit trail on every access to sensitive records.

### What's Built

| Capability | Status |
|-----------|--------|
| SOS system with AI triage pipeline | ✅ Operational |
| Multi-department web dashboard (alerts, live map, analytics) | ✅ Operational |
| Field responder mobile views (all 4 types) | ✅ Complete |
| AI prioritization engine (CrewAI + GLM-5) | ✅ Operational |
| Vector intelligence layer (Qdrant) | ✅ Active |
| Telegram news monitoring agent | ✅ In branch |
| Patient trust & risk scoring | ✅ Operational |
| GPS geofence auto-resolution | ✅ Operational |
| News feed (mobile) | ✅ UI ready, integration in progress |
| SMS gateway (receive + acknowledge) | ✅ Operational |

### Scale & Impact

- Every SOS automatically enriched with patient medical context — no manual lookup
- AI triage score reduces time-to-dispatch by surfacing the most critical cases first
- Vector semantic search enables cross-source event correlation at scale
- Offline SOS delivery means coverage in disaster zones where existing systems fail
- Stakeholder-specific views ensure each response team sees only what is relevant to them

### Team

| Name | Role |
|------|------|
| Wael | AI & Fullstack Developer |
| Tareq | Mobile Developer, DevOps |
| Mahmoud | AI & Fullstack Developer |
| Leen | Frontend Developer, UI/QA |
| Roa | Frontend Developer, UI/QA |

---

*Last updated: 2026-02-17 | TMT Development Team*
