# Technical Proposal: MEDAIGENCY Project
## RFQ 756/2026 - Technical Consultant for Interreg NEXTMED

---

<div align="center">

**Submitted To:** Birzeit University (BZU)
**Tender Reference:** NB-PS-Consulting-Technical Consultant for the Interreg NEXTMED MEDAIGENCY Project
**Tender Number:** 756/2026
**Application Lot:** Lot A – AI Crisis Intake, Triage & Response Support
**Submission Date:** March 2026

</div>

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Understanding of Requirements](#2-understanding-of-requirements)
3. [Proposed Solution: TMT Platform](#3-proposed-solution-tmt-platform)
4. [Technical Architecture](#4-technical-architecture)
5. [Feature Mapping to Lot A Requirements](#5-feature-mapping-to-lot-a-requirements)
6. [AI & NLP Components](#6-ai--nlp-components)
7. [Technology Stack](#7-technology-stack)
8. [Ethical & Responsible Design](#8-ethical--responsible-design)
9. [Implementation Approach](#9-implementation-approach)
10. [Project Timeline](#10-project-timeline)
11. [Team Qualifications](#11-team-qualifications)
12. [Demonstrated Capabilities](#12-demonstrated-capabilities)
13. [Sustainability & Scalability](#13-sustainability--scalability)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

### 1.1 About TMT (Triage & Monitor for Threats)

We present **TMT (Triage & Monitor for Threats)**, an enterprise-grade emergency response platform specifically designed for crisis management in conflict zones and disaster scenarios. TMT has been developed with deep understanding of the challenges faced in the Mediterranean region, particularly in areas experiencing complex humanitarian emergencies.

### 1.2 Why TMT for MEDAIGENCY

TMT directly addresses the core objectives of the MEDAIGENCY project:

| MEDAIGENCY Objective | TMT Capability |
|---------------------|----------------|
| AI-powered crisis intake | ✅ One-tap SOS with AI triage conversation |
| Intelligent triage & prioritization | ✅ GLM-5 powered severity classification |
| Multi-channel resilient communication | ✅ Internet → SMS → Bluetooth Mesh fallback |
| Real-time situational awareness | ✅ Live map with crisis intelligence |
| Ethics-by-design | ✅ AES-256-GCM encryption, consent-based data |
| Offline-first operation | ✅ Full offline capability for conflict zones |

### 1.3 Current Development Status

| Metric | Value |
|--------|-------|
| **Total Source Files** | 256 files |
| **Total Lines of Code** | 54,771+ lines |
| **Backend Modules** | 50+ Python modules |
| **Frontend Components** | 30+ React components |
| **API Endpoints** | 100+ endpoints |
| **Test Coverage** | 569+ tests |
| **Development Completion** | 75% |

### 1.4 Key Differentiators

1. **Battle-Tested Architecture**: Designed specifically for conflict zones (Gaza, Lebanon, Syria use cases)
2. **Triple-Layer Communication**: Ensures SOS delivery even when infrastructure fails
3. **AI-Native Design**: AI integrated at every layer, not bolted on
4. **Offline-First**: Full functionality without internet connectivity
5. **Multilingual**: Arabic and English support built-in
6. **Open for Integration**: API-first design for BZU platform integration

---

## 2. Understanding of Requirements

### 2.1 Lot A Scope Analysis

Based on the RFQ, Lot A requires:

**A1. Co-Design of Crisis Intake & Decision-Support Logic**
- Incident reporting workflows
- Crisis triage mechanisms
- Prioritization and routing algorithms
- Decision-support rules and escalation logic

**A2. AI & NLP Technical Development**
- Multilingual NLU components
- Priority classification models
- Duplicate detection / clustering logic
- Explainable, transparent AI
- Human-in-the-loop support

**A3. Prototyping, Testing & Integration**
- Proof-of-concept development
- Integration with BZU platforms
- Testing and validation cycles

**A4. Ethical, Responsible & User-Centered Design**
- Ethics-by-design approach
- Data anonymization
- User-centered logic for all stakeholders

### 2.2 Our Interpretation

The MEDAIGENCY project seeks to leverage AI to transform emergency response in crisis-prone regions. The key challenges we identify:

1. **Connectivity Unreliability**: Infrastructure damage common in emergencies
2. **Information Overload**: First responders overwhelmed with unstructured data
3. **Triage Efficiency**: Need for rapid, accurate prioritization
4. **Multi-Stakeholder Coordination**: Hospitals, police, civil defense must sync
5. **Data Sensitivity**: Medical/personal data requires strong protection
6. **Multilingual Context**: Arabic-English code-switching common

TMT addresses all of these through its existing architecture.

---

## 3. Proposed Solution: TMT Platform

### 3.1 Platform Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TMT SYSTEM ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Patient     │    │  Hospital    │    │  Police      │    │  Civil       │  │
│  │  Mobile App  │    │  Dashboard   │    │  Dashboard   │    │  Defense     │  │
│  │  (Capacitor) │    │  (React)     │    │  (React)     │    │  Dashboard   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴───────────────────┴───────────────────┘          │
│                                      │                                          │
│                          ┌───────────┴───────────┐                              │
│                          │    COMMUNICATION       │                              │
│                          │    LAYER               │                              │
│                          │  ┌─────────────────┐  │                              │
│                          │  │ WebSocket/HTTP  │  │                              │
│                          │  │ SMS (Twilio)    │  │                              │
│                          │  │ Bluetooth Mesh  │  │                              │
│                          │  │ (Bridgefy)      │  │                              │
│                          │  └─────────────────┘  │                              │
│                          └───────────┬───────────┘                              │
│                                      │                                          │
│  ┌───────────────────────────────────┴───────────────────────────────────────┐  │
│  │                         BACKEND SERVICES                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │  FastAPI    │  │  Celery     │  │  Socket.IO  │  │  Telegram   │      │  │
│  │  │  REST API   │  │  Workers    │  │  Real-time  │  │  Agent      │      │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │  │
│  └─────────┼────────────────┼────────────────┼────────────────┼─────────────┘  │
│            │                │                │                │                │
│  ┌─────────┴────────────────┴────────────────┴────────────────┴─────────────┐  │
│  │                         DATA LAYER                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ PostgreSQL  │  │   Redis     │  │   Qdrant    │  │  External   │      │  │
│  │  │ + PostGIS   │  │   Cache     │  │  Vector DB  │  │  APIs       │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         AI/ML LAYER                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │  CrewAI     │  │   GLM-5     │  │  Sentence   │  │  Risk       │      │  │
│  │  │  Agents     │  │   (Zhipu)   │  │  Transform  │  │  Scoring    │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Core Modules

#### 3.2.1 SOS Emergency System

| Feature | Description | Status |
|---------|-------------|--------|
| One-Tap SOS Button | Large, always-visible emergency trigger | ✅ Complete |
| 5-Second Cancel Window | Countdown before SOS transmission | ✅ Complete |
| GPS Auto-Capture | Location captured immediately on trigger | ✅ Complete |
| AI Triage Conversation | Post-SOS AI chat for structured data collection | ✅ Complete |
| Voice Input | Speech-to-text with waveform animation | ✅ Complete |
| Quick-Tap Options | Pre-defined response chips | ✅ Complete |
| Photo Attachment | Situational photo capture | ✅ Complete |
| Unresponsive Auto-Send | Auto-submit after 30s no response | ✅ Complete |
| Low Battery Mode | Expedited 2-question flow when battery < 15% | ✅ Complete |
| Urgency Keyword Detection | Immediate send on crisis keywords | ✅ Complete |
| Offline Queuing | Encrypted IndexedDB storage when offline | ✅ Complete |
| WebSocket Broadcast | Real-time notification to stakeholders | ✅ Complete |

#### 3.2.2 Multi-Channel Communication

| Layer | Technology | Fallback Trigger | Status |
|-------|------------|------------------|--------|
| Internet (Primary) | WebSocket + HTTPS | — | ✅ Active |
| SMS (Secondary) | Twilio Gateway | No internet | ✅ Active |
| Bluetooth Mesh (Tertiary) | Bridgefy SDK | No internet + no cellular | ✅ Implemented |

#### 3.2.3 Crisis Intelligence

| Feature | Description | Status |
|---------|-------------|--------|
| Telegram Channel Monitoring | Automated message extraction from crisis channels | ✅ Active |
| GLM-5 Classification | AI-powered crisis detection and categorization | ✅ Active |
| Vector Semantic Search | Qdrant similarity queries for related incidents | ✅ Active |
| Knowledge Gap Detection | Coverage analysis for missing information | ✅ Active |
| Trust Scoring | Per-source reliability scoring | ✅ Active |
| Event Deduplication | Prevent duplicate alerts and SOS | ✅ Active |

---

## 4. Technical Architecture

### 4.1 Service Communication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOS DISPATCH FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Patient Device                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐     Success     ┌─────────────┐                │
│  │ Try Layer 1 │ ──────────────► │  Backend    │                │
│  │ (Internet)  │                 │  API        │                │
│  └──────┬──────┘                 └──────┬──────┘                │
│         │ Failure                       │                        │
│         ▼                               ▼                        │
│  ┌─────────────┐     Success     ┌─────────────┐                │
│  │ Try Layer 2 │ ──────────────► │  SMS        │                │
│  │ (SMS)       │                 │  Gateway    │                │
│  └──────┬──────┘                 └──────┬──────┘                │
│         │ Failure                       │                        │
│         ▼                               ▼                        │
│  ┌─────────────┐     Relay       ┌─────────────┐                │
│  │ Try Layer 3 │ ──────────────► │  Bridgefy   │                │
│  │ (Bluetooth) │                 │  Mesh       │                │
│  └─────────────┘                 └──────┬──────┘                │
│                                         │                        │
│                                         ▼                        │
│                                  ┌─────────────┐                │
│                                  │  Backend    │                │
│                                  │  (via relay)│                │
│                                  └─────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 AI Triage Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI TRIAGE CONVERSATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SOS Triggered                                                   │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────┐                    │
│  │ AI Assistant asks structured questions: │                    │
│  │   1. "Are you hurt? (Safe/Injured/      │                    │
│  │       Trapped/Needs Evacuation)"        │                    │
│  │   2. "How many people need help?"       │                    │
│  │   3. "What happened?"                   │                    │
│  │   4. "Can you describe injuries?"       │                    │
│  │   5. "Any medical conditions?"          │                    │
│  └────────────────┬────────────────────────┘                    │
│                   │                                              │
│                   ▼                                              │
│  ┌─────────────────────────────────────────┐                    │
│  │ User responds via:                       │                    │
│  │   - Quick-tap buttons                   │                    │
│  │   - Voice input (Arabic/English)        │                    │
│  │   - Text input                          │                    │
│  │   - Photo attachment                    │                    │
│  └────────────────┬────────────────────────┘                    │
│                   │                                              │
│                   ▼                                              │
│  ┌─────────────────────────────────────────┐                    │
│  │ NLP Processing:                          │                    │
│  │   - Language detection (ar/en)          │                    │
│  │   - Entity extraction                   │                    │
│  │   - Severity classification (1-5)       │                    │
│  │   - Urgency keyword detection           │                    │
│  │   - Medical condition tagging           │                    │
│  └────────────────┬────────────────────────┘                    │
│                   │                                              │
│                   ▼                                              │
│  ┌─────────────────────────────────────────┐                    │
│  │ Prioritization Engine:                   │                    │
│  │   - Priority score (0-100)              │                    │
│  │   - Department routing (Hospital/       │                    │
│  │     Police/Civil Defense)               │                    │
│  │   - Resource recommendations            │                    │
│  │   - Escalation triggers                 │                    │
│  └────────────────┬────────────────────────┘                    │
│                   │                                              │
│                   ▼                                              │
│  ┌─────────────────────────────────────────┐                    │
│  │ Output to Dashboard:                     │                    │
│  │   - Full triage transcript              │                    │
│  │   - Structured data fields              │                    │
│  │   - AI recommendations                  │                    │
│  │   - Confidence scores                   │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Microservices Topology

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| PostgreSQL | 5432 | PostgreSQL 16 + PostGIS | Primary database with geospatial support |
| Redis | 6379 | Redis 7 | Message broker, cache, rate limiting |
| Qdrant | 6333/6334 | Qdrant 1.7.4 | Vector database for semantic search |
| Backend API | 8000 | FastAPI + Uvicorn | REST API + WebSocket |
| Celery Worker | — | Celery 5.3 | Async task processing |
| Celery Beat | — | Celery Beat | Scheduled task coordination |
| Frontend | 3000 | React 19 + Vite | Web dashboard |

---

## 5. Feature Mapping to Lot A Requirements

### 5.1 A1: Crisis Intake & Decision-Support Logic

| RFQ Requirement | TMT Implementation | Evidence |
|-----------------|-------------------|----------|
| Incident reporting workflows | One-tap SOS with AI-guided triage conversation | `frontend/src/pages/patient/SOS.tsx` |
| Crisis triage | AI assistant asks structured questions, extracts severity | `frontend/src/components/sos/AIAssistantScreen.tsx` |
| Prioritization | 1-5 severity scale with auto-escalation rules | `backend/app/api/routes/sos.py` |
| Routing | Auto-routes to Hospital/Police/Civil Defense based on incident type | `backend/app/services/patient_service.py` |
| Decision-support rules | AI recommendations for equipment, procedures | `backend/app/services/triage_service.py` |
| Escalation logic | Low battery auto-expedite, urgency keywords trigger immediate | `frontend/src/store/sosStore.ts` |
| Performance indicators | Real-time KPIs: active SOS, response time, resolution rate | `frontend/src/pages/admin/Dashboard.tsx` |

### 5.2 A2: AI & NLP Technical Development

| RFQ Requirement | TMT Implementation | Evidence |
|-----------------|-------------------|----------|
| Multilingual NLU | Arabic + English with auto-detection | `backend/app/services/translation_service.py` |
| Priority classification | GLM-5 powered severity scoring | `backend/app/services/triage_service.py` |
| Duplicate detection | UUID-based deduplication + semantic similarity | `backend/app/api/routes/mesh.py`, `backend/app/services/embedding_service.py` |
| Clustering logic | Vector clustering via Qdrant | `backend/app/services/embedding_service.py` |
| Explainable AI | AI recommendations include reasoning | All AI responses structured |
| Human-in-the-loop | Manual override in admin dashboard | `frontend/src/pages/admin/SOSList.tsx` |

### 5.3 A3: Prototyping, Testing & Integration

| RFQ Requirement | TMT Implementation | Evidence |
|-----------------|-------------------|----------|
| Proof-of-concept | Working prototype with 75% completion | Full codebase |
| Integration readiness | REST API + WebSocket for external integration | `backend/app/api/routes/` |
| Testing infrastructure | 569+ tests (Vitest + pytest) | `frontend/src/**/*.test.ts`, `backend/tests/` |
| Validation cycles | Continuous testing with CI/CD ready | Test configuration files |

### 5.4 A4: Ethical & User-Centered Design

| RFQ Requirement | TMT Implementation | Evidence |
|-----------------|-------------------|----------|
| Ethics-by-design | Data minimization, consent flows, purpose limitation | Architecture design |
| Data anonymization | AES-256-GCM encryption, hashed identifiers | `frontend/src/services/offlineVault.ts` |
| User-centered for responders | Dedicated responder mobile interfaces | `frontend/src/pages/responder/` |
| User-centered for operators | Admin dashboards with KPIs | `frontend/src/pages/admin/` |
| User-centered for citizens | Simple SOS flow, offline support | `frontend/src/pages/patient/` |

---

## 6. AI & NLP Components

### 6.1 AI Stack Overview

```
┌──────────────────────────────────────────────────────────────┐
│                       TMT AI LAYER                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   LLM Integration                        │ │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │ │
│  │  │  GLM-5    │  │  LiteLLM  │  │  Abstraction      │   │ │
│  │  │  (Zhipu)  │  │  Gateway  │  │  Layer            │   │ │
│  │  └───────────┘  └───────────┘  └───────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   Agent Framework                        │ │
│  │  ┌───────────────────────────────────────────────────┐  │ │
│  │  │  CrewAI Multi-Agent System                        │  │ │
│  │  │    - Triage Agent (crisis classification)         │  │ │
│  │  │    - Intelligence Agent (Telegram monitoring)     │  │ │
│  │  │    - Verification Agent (cross-reference)         │  │ │
│  │  └───────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Embedding & Retrieval                    │ │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │ │
│  │  │ Sentence  │  │  Qdrant   │  │  Semantic Search  │   │ │
│  │  │ Transform │  │  Vector   │  │  & Clustering     │   │ │
│  │  │           │  │  Store    │  │                   │   │ │
│  │  └───────────┘  └───────────┘  └───────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 NLP Capabilities

| Capability | Technology | Description |
|------------|------------|-------------|
| **Language Detection** | Built-in | Auto-detect Arabic/English in user input |
| **Entity Extraction** | GLM-5 + Rules | Extract locations, injuries, quantities |
| **Severity Classification** | GLM-5 | 1-5 severity based on described conditions |
| **Urgency Detection** | Keyword + NLP | Detect crisis keywords (bleeding, trapped, fire) |
| **Sentiment Analysis** | GLM-5 | Detect panic, distress levels |
| **Summarization** | GLM-5 | Generate concise summaries for responders |
| **Translation** | GLM-5 | Arabic ↔ English real-time translation |
| **Semantic Similarity** | Sentence Transformers + Qdrant | Duplicate/related incident detection |

### 6.3 Explainability Features

All AI outputs include:

1. **Confidence Scores**: 0.0–1.0 probability for each classification
2. **Reasoning Traces**: Why the AI made each decision
3. **Source Attribution**: Which data led to conclusions
4. **Override Options**: Human operators can always override AI decisions
5. **Audit Logs**: Complete history of AI decisions for review

---

## 7. Technology Stack

### 7.1 Backend Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | FastAPI | 0.109+ | Async Python web framework |
| **Database** | PostgreSQL | 16 | Primary relational database |
| **Geospatial** | PostGIS | 3.4 | Geographic data extension |
| **ORM** | SQLAlchemy | 2.0+ | Object-relational mapping |
| **Task Queue** | Celery | 5.3+ | Distributed task processing |
| **Cache/Broker** | Redis | 7.x | In-memory data store |
| **Vector DB** | Qdrant | 1.7.4 | Semantic similarity search |
| **Real-time** | Socket.IO | 5.11+ | WebSocket communication |
| **Auth** | python-jose | 3.3.0 | JWT token handling |
| **Encryption** | cryptography | 42.0+ | AES-256-GCM data encryption |
| **SMS** | Twilio | 8.13+ | SMS gateway |
| **AI Framework** | CrewAI | 1.9.3 | Multi-agent orchestration |
| **LLM** | LiteLLM | 1.50+ | LLM abstraction layer |
| **Embeddings** | sentence-transformers | 2.5+ | Text embeddings |

### 7.2 Frontend Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | React | 19.0.0 | UI component library |
| **Language** | TypeScript | 5.7 | Type-safe JavaScript |
| **Build Tool** | Vite | 6.1 | Fast development bundler |
| **Styling** | Tailwind CSS | 4.0 | Utility-first CSS |
| **State** | Zustand | 5.0 | Minimal state management |
| **Routing** | React Router | 7.1 | Client-side routing |
| **Maps** | Leaflet | 1.9 | Interactive maps |
| **Charts** | Recharts | 2.15 | Data visualization |
| **i18n** | i18next | 24.2 | Internationalization |
| **Native Bridge** | Capacitor | 8.1 | iOS/Android native APIs |
| **Testing** | Vitest | 4.0 | Unit testing framework |

### 7.3 Infrastructure

| Category | Technology | Purpose |
|----------|------------|---------|
| **Containerization** | Docker | Service containerization |
| **Orchestration** | Docker Compose | Multi-container management |
| **CI/CD Ready** | GitHub Actions compatible | Continuous integration |

---

## 8. Ethical & Responsible Design

### 8.1 Privacy by Design

| Principle | Implementation |
|-----------|----------------|
| **Data Minimization** | Only collect data necessary for emergency response |
| **Purpose Limitation** | Data used only for crisis response, not secondary purposes |
| **Storage Limitation** | Automated data expiration (24h for temp data) |
| **Encryption at Rest** | AES-256-GCM for all sensitive data |
| **Encryption in Transit** | TLS 1.3 for all communications |

### 8.2 Offline Vault Security

```
┌──────────────────────────────────────────────────────────────┐
│                    OFFLINE VAULT ARCHITECTURE                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Device Storage (IndexedDB)                                   │
│       │                                                       │
│       ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ OfflineVault                                             │ │
│  │   - AES-256-GCM encryption                               │ │
│  │   - PBKDF2 key derivation (100k iterations)              │ │
│  │   - Device fingerprint + auth token as key material      │ │
│  │   - Unique IV per record                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│       │                                                       │
│       ▼                                                       │
│  Protected Stores:                                            │
│   - pending_sos: Queued emergency requests                    │
│   - pending_sync: Actions awaiting upload                     │
│   - patient_cache: Cached medical profile                     │
│   - local_actions: Staff actions for sync                     │
│                                                               │
│  Security Guarantees:                                         │
│   ✅ Device seizure cannot expose plaintext data              │
│   ✅ Each record encrypted independently                      │
│   ✅ Key never stored, derived at runtime                     │
│   ✅ Automatic key rotation on token refresh                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 8.3 Consent & Transparency

| Feature | Implementation |
|---------|----------------|
| **Informed Consent** | Clear explanation of data use at registration |
| **Opt-in Location** | Location only captured when SOS triggered |
| **Data Access** | Users can view/export their data |
| **Data Deletion** | Users can request account deletion |
| **Audit Trail** | All data access logged |

### 8.4 Human-in-the-Loop

| Decision | AI Role | Human Role |
|----------|---------|------------|
| SOS Priority | Suggests priority 1-5 | Operator can override |
| Department Routing | Suggests Hospital/Police/Civil Defense | Operator can reassign |
| Case Resolution | Tracks status | Operator marks resolved |
| Alert Verification | Scores confidence | Admin verifies/rejects |

---

## 9. Implementation Approach

### 9.1 Collaboration Model

We propose an **iterative co-development** approach aligned with BZU's requirements:

```
┌──────────────────────────────────────────────────────────────┐
│                  CO-DEVELOPMENT PROCESS                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Week 1-2: Requirements Alignment                             │
│     ├── Joint workshops with BZU team                         │
│     ├── Review existing BZU platforms                         │
│     ├── Identify integration points                           │
│     └── Define success criteria                               │
│                                                               │
│  Week 3-6: Iterative Development                              │
│     ├── 2-week sprints                                        │
│     ├── Weekly demos to BZU team                              │
│     ├── Continuous feedback integration                       │
│     └── Shared documentation                                  │
│                                                               │
│  Week 7-8: Integration & Testing                              │
│     ├── Integration with BZU systems                          │
│     ├── Joint testing sessions                                │
│     ├── Performance validation                                │
│     └── Security review                                       │
│                                                               │
│  Week 9-10: Pilot Preparation                                 │
│     ├── User acceptance testing                               │
│     ├── Training materials                                    │
│     └── Pilot deployment                                      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Integration Strategy

TMT is designed for seamless integration with BZU's existing platforms:

| Integration Type | Approach |
|-----------------|----------|
| **API Integration** | RESTful API with OpenAPI specification |
| **Webhook Support** | Real-time event notifications |
| **SSO** | OAuth 2.0 / SAML compatible |
| **Data Export** | Standard formats (JSON, CSV) |
| **Embedding** | iframe-compatible dashboards |

### 9.3 Knowledge Transfer

| Deliverable | Description |
|-------------|-------------|
| **Technical Documentation** | Full API documentation, architecture guides |
| **Code Handover** | Complete source code with comments |
| **Training Sessions** | Workshops for BZU technical team |
| **Maintenance Guide** | How to update, scale, and troubleshoot |

---

## 10. Project Timeline

### 10.1 Phase Breakdown

| Phase | Description | Timeframe | Deliverables |
|-------|-------------|-----------|--------------|
| **Phase I** | Requirements & Use-Case Design | March 2026 | Requirements document, use case diagrams, integration spec |
| **Phase II** | Architecture & Technical Design | April 2026 | Technical architecture, API design, data models |
| **Phase III** | Core AI Development | May - August 2026 | NLP components, priority models, duplicate detection |
| **Phase IV** | Interface & UX Design | September - October 2026 | UI/UX designs, dashboard prototypes |
| **Phase V** | Integration & Internal Testing | November - December 2026 | Integrated system, test reports, bug fixes |
| **Phase VI** | Pilot-Ready Package v1.0 | January - March 2027 | Production deployment, documentation, training |

### 10.2 Milestone Schedule

```
Mar 2026     Apr 2026     Aug 2026     Oct 2026     Dec 2026     Mar 2027
    │            │            │            │            │            │
    ▼            ▼            ▼            ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│Phase I │  │Phase II│  │Phase   │  │Phase IV│  │Phase V │  │Phase VI│
│Require-│  │Arch &  │  │III     │  │UI/UX   │  │Integr- │  │Pilot   │
│ments   │  │Design  │  │Core AI │  │Design  │  │ation   │  │Ready   │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
```

### 10.3 Key Milestones

| Milestone | Date | Description |
|-----------|------|-------------|
| M1 | End March 2026 | Requirements signed off |
| M2 | End April 2026 | Architecture approved |
| M3 | End June 2026 | Core AI MVP functional |
| M4 | End August 2026 | Full AI development complete |
| M5 | End October 2026 | UI/UX approved |
| M6 | End December 2026 | Integration testing complete |
| M7 | End March 2027 | Pilot deployment ready |

---

## 11. Team Qualifications

### 11.1 Technical Competencies

| Requirement | Qualification |
|-------------|---------------|
| Bachelor's+ in CS/SE/AI | ✅ Team includes CS and Software Engineering graduates |
| Full-stack development | ✅ React 19, FastAPI, PostgreSQL, Docker |
| Python, JavaScript, TypeScript | ✅ Primary development languages |
| API & microservices | ✅ FastAPI REST + WebSocket, Celery workers |
| AI/ML model development | ✅ CrewAI, GLM-5, Sentence Transformers, Qdrant |
| LLM/Generative AI | ✅ GLM-5 (Zhipu), LiteLLM integration |
| Cloud platforms | ✅ Docker, deployment-ready architecture |
| Large-scale deployment | ✅ Containerized, horizontally scalable |
| Health/emergency context | ✅ TMT specifically designed for emergency response |
| Transnational collaboration | ✅ Remote-first development process |

### 11.2 Demonstrated Experience

1. **TMT Platform Development**: 54,771+ lines of production code
2. **AI Integration**: Working AI triage system with GLM-5
3. **Real-time Systems**: WebSocket + Socket.IO implementation
4. **Mobile Development**: Capacitor-based cross-platform app
5. **Offline-First Architecture**: IndexedDB + Service Worker + Bridgefy mesh
6. **Security Implementation**: JWT auth, AES-256-GCM encryption

---

## 12. Demonstrated Capabilities

### 12.1 Working Features (Screenshots Available)

| Feature | Status | Description |
|---------|--------|-------------|
| SOS Emergency Flow | ✅ | Complete one-tap → AI triage → dispatch flow |
| AI Triage Conversation | ✅ | Voice + text + quick-tap input |
| Multi-Layer Fallback | ✅ | Internet → SMS → Bluetooth mesh |
| Admin Dashboard | ✅ | Real-time SOS list, KPIs, live map |
| Field Responder App | ✅ | Mobile interface for ambulance/police |
| Crisis Intelligence | ✅ | Telegram monitoring + AI classification |
| Offline Support | ✅ | Encrypted local storage + background sync |

### 12.2 Code Metrics

```
──────────────────────────────────────────────────────────────
                    TMT CODE STATISTICS
──────────────────────────────────────────────────────────────

Repository Structure:
  backend/                 50+ Python modules
  frontend/                30+ React components
  docs/                    15+ documentation files

Code Volume:
  Total Files:             256
  Total Lines:             54,771+

Test Coverage:
  Frontend Tests:          237 tests (Phase 7 alone)
  Backend Tests:           20+ tests
  Total Tests:             569+ tests passing

API Endpoints:
  Routes:                  16 modules
  Endpoints:               100+

Database:
  Models:                  14 SQLAlchemy ORM models
  Migrations:              Alembic managed

──────────────────────────────────────────────────────────────
```

### 12.3 Architecture Strengths

| Strength | Benefit for MEDAIGENCY |
|----------|------------------------|
| **Offline-First** | Works in infrastructure-damaged zones |
| **Multi-Channel** | Ensures message delivery under any conditions |
| **AI-Native** | AI deeply integrated, not bolted on |
| **Multilingual** | Arabic + English ready |
| **Modular** | Easy to integrate with BZU systems |
| **Tested** | 569+ tests ensure reliability |
| **Documented** | Comprehensive technical documentation |

---

## 13. Sustainability & Scalability

### 13.1 Beyond the Pilot

| Aspect | Strategy |
|--------|----------|
| **Code Handover** | Full source code with documentation |
| **Training** | BZU team trained to maintain system |
| **Modular Design** | Easy to extend with new features |
| **Open Standards** | No vendor lock-in |
| **Container-Based** | Easy to deploy on any infrastructure |

### 13.2 Scalability

| Dimension | Approach |
|-----------|----------|
| **Horizontal** | Stateless backend scales with load balancers |
| **Database** | PostgreSQL read replicas for high query load |
| **Real-time** | Redis pub/sub for WebSocket distribution |
| **AI** | Async Celery workers for AI processing |
| **Geographic** | Multi-region deployment ready |

### 13.3 Maintenance Plan

| Period | Support |
|--------|---------|
| Pilot Phase | Full support included |
| Post-Pilot | Optional maintenance contract |
| Knowledge Base | Comprehensive documentation |
| Updates | Security patches and improvements |

---

## 14. Appendices

### Appendix A: API Endpoint Summary

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| `/auth` | 5 | Authentication, registration, OTP |
| `/patients` | 8 | Patient CRUD, medical records |
| `/hospitals` | 6 | Hospital management |
| `/sos` | 10 | SOS creation, triage, status updates |
| `/alerts` | 5 | Alert management |
| `/mesh` | 4 | Bluetooth mesh relay |
| `/telegram` | 6 | Telegram channel management |
| `/admin` | 10 | Administrative functions |
| `/analytics` | 5 | Reporting and dashboards |
| `/livemap` | 4 | Real-time map data |
| `/sync` | 3 | Offline sync (batch upload) |

### Appendix B: Database Schema Overview

| Model | Fields | Purpose |
|-------|--------|---------|
| User | id, email, phone, role, is_active | Authentication |
| Patient | id, name, blood_type, conditions, location | Medical profile |
| Hospital | id, name, location, capacity, specialties | Facility info |
| SosRequest | id, patient_id, location, severity, status | Emergency records |
| Alert | id, title, content, severity, location | Crisis alerts |
| MeshMessage | id, sender_id, content, relay_chain | Mesh communications |
| TelegramMessage | id, channel, content, embedding | Crisis intel |

### Appendix C: Security Measures

| Layer | Measure |
|-------|---------|
| **Transport** | TLS 1.3 |
| **Authentication** | JWT + bcrypt |
| **Authorization** | Role-based access control |
| **Data at Rest** | AES-256-GCM |
| **Rate Limiting** | Redis-backed limits |
| **Audit** | Comprehensive logging |

### Appendix D: References

1. TMT Project Repository
2. TMT Technical Report (docs/TMT_PROJECT_REPORT.md)
3. Implementation Progress Report (docs/IMPLEMENTATION_PROGRESS_REPORT.md)
4. Phase 7 Offline Support Plan (docs/PHASE7_OFFLINE_SUPPORT_PLAN.md)
5. Crisis Routing Documentation (docs/CRISIS_ROUTING_AND_TRUSTED_NEWS.md)

---

## Contact Information

For technical questions regarding this proposal, please contact:

**[Your Organization Name]**
**Email:** [your-email]
**Phone:** [your-phone]

---

<div align="center">

*This proposal demonstrates our commitment to delivering a production-ready AI crisis response platform that aligns with the MEDAIGENCY project objectives and BZU's vision for technology-enabled emergency management.*

**Submitted in response to RFQ 756/2026**

</div>
