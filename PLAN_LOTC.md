# Lot C — AI Crisis Intelligence & Coordination Platform
## Full Project Plan (Strategic + Technical)

**Tender:** Interreg NEXTMED MEDAIGENCY — Tender 2026/756
**Lot:** C (Primary) — AI Crisis Intelligence & Coordination Platform
**Vendor:** Mintora for Intelligent Systems P.L.C. (Mixcore Tech) — Team TMT
**Client:** Birzeit University
**Engagement:** July 2026 → July 2027 · 6 phases · USD 32,000
**Document status:** v1.0 — planning baseline
**Last updated:** 2026-06-29

---

## 0. TL;DR — The Decision

**Evolve the existing TMT prototype into the production platform. Do NOT rebuild from scratch.**

The hackathon prototype in this repo is not a throwaway mockup. It is a coherent, working system of ~13k lines of backend and ~37k lines of frontend, already running the exact architecture Lot C requires (FastAPI · PostgreSQL/PostGIS · Redis · Qdrant · Celery · React/TS · Capacitor · CrewAI), with tests, real git history, and detailed architecture docs already written. Starting over would throw away a validated foundation to arrive back at the same stack months later.

The right move is a **hardening-and-formalization track**, not a reset. We treat the prototype as a high-fidelity Phase 0 spike: keep the proven bones, fix the three things that block a production/compliance audit (the Telegram ingestion approach, the health-data compliance framework, and production infrastructure), and re-architect formally inside Phase I–II — which is exactly what those phases are for and what BZU is paying for.

> **One caveat that makes this conditional, not automatic:** "evolve" only beats "rebuild" if Phase II includes a deliberate refactor pass. We are reusing a hackathon codebase — it carries hackathon debt. The plan below budgets for that debt explicitly. If we skip the refactor and just bolt features on, the reuse advantage evaporates within two phases.

---

## 1. Why Evolve, Not Rebuild — The Evidence

### 1.1 What already exists in this repo

**Backend (`backend/app/`)** — FastAPI, async SQLAlchemy 2.0, 18 route modules, 14 ORM models, 11 services:

| Area | Already built |
|---|---|
| Domain models | patient, medical_record, hospital, alert, sos_request, aid_request, case_transfer, geo_event, sms_log, telegram_channel, telegram_message, audit_log, user |
| Services | patient, hospital, alert, analytics, livemap, sms, sos_resolution, transfer, aid, compliance + AI agent package |
| AI layer | CrewAI multi-agent crews (SOS Triage, Intel Analysis, Verification), embeddings, gap detection, RAG tooling |
| API surface | auth, admin, patients, hospitals, records, alerts, analytics, sos, sms, livemap, aid_requests, transfers, simulation, telegram, news, mesh, sync |
| Middleware | JWT auth + RBAC, audit logging, field encryption, rate limiting |
| Real-time | Socket.IO handler, Celery worker + beat across 7 named queues |
| Tests | pytest suites (agent, fallback, department routing, mesh) |

**Frontend (`frontend/src/`)** — React 19 + TypeScript + Vite + Tailwind + Zustand:

| Area | Already built |
|---|---|
| Admin | dashboard, hospital mgmt, user mgmt, Telegram mgmt |
| Hospital / coordinator | dashboard, live map, patient list/detail, crisis alerts, analytics, aid requests, case transfers, status update |
| Responder roles | police, firefighter, ambulance, civil_defense views |
| Citizen | SOS, register, profile, alerts, AI assistant, news |
| Platform | Leaflet maps, Recharts, Socket.IO client, i18n (Arabic/English), Capacitor iOS+Android, native service layer with tests |

**Infra:** `docker-compose.yml` orchestrating postgis/postgis:16 · redis:7 · qdrant:1.7 · backend · celery-worker · celery-beat · frontend.

### 1.2 Maturity vs. the Lot C timeline

Mapping the prototype against our own 6-phase scope: the prototype already contains **working drafts of deliverables scheduled for Phases III–IV** (AI triage/scoring, live map, citizen app, analytics). That is months of de-risking. A from-scratch rebuild would re-derive all of it.

### 1.3 The honest counter-argument (and our answer)

| Reason someone might say "rebuild" | Our response |
|---|---|
| "Hackathon code is messy." | True in places — so Phase II includes a scoped refactor + test-coverage gate, not a rewrite. |
| "The Telegram approach is legally unsafe." | Correct and already documented in `docs/PROJECT_ANALYSIS.md §3`. We **remove and replace** that subsystem (§4 below) — it is one bounded module, not the whole platform. |
| "No production infra / CI-CD / IaC." | Add it in Phase II–V. This is greenfield additive work, equally needed whether we reuse or rebuild. |
| "Compliance was never designed in." | Partly false — `compliance_service`, audit middleware, and field encryption already exist. We formalize them into a real DPIA + governance framework, building on what's there. |

**Net:** every "rebuild" reason is either a bounded module replacement or additive work we'd have to do anyway. None justifies discarding the working core.

---

## 2. Lot C Scope — What We Are Actually Delivering

Lot C is the **command-and-coordination layer**: a shared Common Operating Picture (COP) for multi-agency emergency response.

**In scope (per the tender + delivery timeline):**
- COP and admin crisis dashboard for emergency coordinators
- Multi-agency situational awareness (health, police, civil defense, hospitals)
- GIS live map with multi-layer intelligence + temporal scrub
- AI alert triage, severity assessment, prioritization (P80–P100), duplicate-report clustering
- Social-intelligence / misinformation monitoring + early-warning analytics
- Conversational AI (Arabic/English), RAG pipeline, explainable AI (SHAP) + human-in-the-loop
- Citizen mobile app, citizen web portal, guided SOS, offline/SMS functionality
- Integration with hospital systems and agency data feeds
- Ethics-by-design, documentation, training, knowledge transfer, sustainability handover

**Explicitly NOT this engagement (separate optional lots):**
- Lot A (AI Crisis Intake/Triage) and Lot B (Simulation & Digital Twin) are optional extensions. The prototype touches both (`simulation` route, `crisis-simulator/`), but **we keep them out of the committed Lot C critical path** and treat any reuse as a bonus, not a dependency.

---

## 3. Target Architecture (Production)

We keep the prototype's architecture and harden each layer. Deltas from the current state are marked **[ADD]** / **[CHANGE]** / **[KEEP]**.

```
                       ┌─────────────────────────────────────────┐
                       │  Clients                                 │
                       │  Coordinator COP (web) · Hospital portal │
                       │  Responder apps · Citizen mobile (Capacitor) + PWA │
                       └───────────────┬─────────────────────────┘
                                       │ HTTPS / WSS
                       ┌───────────────▼─────────────────────────┐
              [ADD]    │  Ingress / API Gateway                   │
                       │  TLS · WAF · OAuth2/OIDC · rate limit     │
                       └───────────────┬─────────────────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       │                               │                               │
┌──────▼───────┐              ┌────────▼────────┐             ┌─────────▼────────┐
│ FastAPI app  │  [KEEP]      │ Socket.IO RT    │ [KEEP]      │ Celery workers   │ [KEEP]
│ REST + RBAC  │              │ live map/alerts │             │ 7 queues         │
└──────┬───────┘              └────────┬────────┘             └─────────┬────────┘
       │                               │                                │
┌──────▼─────────────────────────────────────────────────────────────────▼──────┐
│  Service layer (Python)                                                         │
│  patient · hospital · alert · livemap · analytics · sms · transfer · aid        │
│  compliance [CHANGE→formalize] · AI agents (CrewAI) [KEEP]                       │
│  ingestion [CHANGE→ethical Telegram/bot/official-feeds, replace Telethon scrape] │
└──────┬───────────────────────────┬───────────────────────────┬─────────────────┘
       │                           │                           │
┌──────▼──────┐            ┌───────▼───────┐           ┌────────▼────────┐
│ PostgreSQL  │ [KEEP]     │ Qdrant        │ [KEEP]    │ Redis           │ [KEEP]
│ + PostGIS   │            │ vector / RAG  │           │ cache + broker  │
└─────────────┘            └───────────────┘           └─────────────────┘
       │
┌──────▼─────────────────────────────────────────────────────────────────────────┐
│  Cross-cutting [ADD]: Kubernetes/OpenShift · Terraform IaC · CI/CD · secrets/KMS │
│  · centralized logging/metrics/tracing (OpenTelemetry) · automated backups       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Stack decision — keep the prototype's choices

The technical proposal (p.14–15) lists a broad capability menu (Angular, .NET-style SignalR, K8s, OpenShift, etc.). That is a menu, not a commitment. **We standardize on what the prototype already proved**, because switching frameworks mid-stream would discard working code for no functional gain.

| Layer | Decision | Rationale |
|---|---|---|
| Backend | **KEEP** FastAPI (Python) | Async, fast, auto-docs; AI/ML ecosystem lives in Python |
| Frontend | **KEEP** React 19 + TS + Vite + Tailwind + Zustand | Already built; modern; one codebase web + mobile via Capacitor |
| Mobile | **KEEP** Capacitor (iOS + Android from the web build) | Single source, native device APIs already wired |
| Primary DB | **KEEP** PostgreSQL + PostGIS | Geospatial is core to the COP; PostGIS is the right tool |
| Vector DB | **KEEP** Qdrant | RAG + semantic dedup already implemented |
| Cache/Broker | **KEEP** Redis | Sessions, rate limit, Celery broker |
| Async | **KEEP** Celery + beat | Triage/alert/SMS/embedding pipelines |
| Real-time | **KEEP** Socket.IO | Live map + alert stream |
| AI agents | **KEEP** CrewAI + litellm; **[CHANGE]** make the LLM provider pluggable | Avoid single-vendor lock-in; allow on-prem/self-hosted models for data-sovereignty |
| NLP triage | **[ADD]** XLM-RoBERTa-class multilingual classifier in front of the LLM | Fast (<100ms) Arabic/English crisis classification; cheaper than LLM-per-message |
| Explainability | **[ADD]** SHAP for the scoring models (Phase III deliverable) | Required by scope; supports human-in-the-loop |
| Orchestration | **[ADD]** Kubernetes (or OpenShift, named in proposal) | Production scaling/resilience |
| IaC | **[ADD]** Terraform | Reproducible environments |
| CI/CD | **[ADD]** pipeline (lint, test, scan, build, deploy) | Currently absent |
| Identity | **[CHANGE]** JWT/RBAC → OAuth2/OIDC + JWT, central IdP | Multi-agency SSO, auditable access |
| Secrets | **[ADD]** vault/KMS-backed secrets + AES-256 key mgmt | `.env` is dev-only |
| Observability | **[ADD]** OpenTelemetry, centralized logs/metrics/traces | Mission-critical uptime |

### 3.2 The one subsystem we replace, not keep — Data Ingestion

`docs/PROJECT_ANALYSIS.md §3` already flags the prototype's covert Telethon group-monitoring / account-creation approach as legally unsafe. **We rip it out and replace** with the documented ethical four-layer ingestion (§4 of that doc):

1. **Official TMT Telegram Bot** (Bot API) — admins voluntarily add it to community groups; transparent presence.
2. **Public channel subscription** — broadcast channels, no privacy expectation.
3. **User-submitted reports** — citizens DM/report directly (Ushahidi model).
4. **Official feeds** — weather, seismic (USGS), government disaster alerts as baseline.

This is a bounded module swap behind the existing `ingestion`/`telegram` service boundary — the alert/triage/map pipeline downstream is unaffected.

---

## 4. Compliance & Ethics — Built In, Not Bolted On

Health data is GDPR "special-category" data (Art. 9) with a general prohibition on processing; this is an EU Interreg-funded project, so compliance is a pass/fail gate, not a nicety. The prototype already has `compliance_service`, audit middleware, and field encryption — we formalize these into a real framework.

| Workstream | Action | Phase |
|---|---|---|
| Legal basis & DPIA | Data Protection Impact Assessment; define lawful basis (explicit consent for citizen medical data) | I–II |
| Consent management | Granular, revocable consent records; "delete my data" flows | II, IV |
| Data minimization & retention | Retention schedules, auto-purge, purpose limitation | II–V |
| Encryption | AES-256 at rest (field-level for PHI) + TLS in transit; KMS key management | II |
| Access governance | OAuth2/OIDC, RBAC least-privilege, full audit trail (build on existing audit_log) | II–III |
| Agency data-sharing | Data Processing / sharing agreements with hospitals & agencies | I, V |
| Ethical ingestion | Replace covert monitoring with the four-layer model (§3.2) | III |
| Explainable AI + HITL | SHAP explanations, human approval on high-severity automated actions | III |
| Ethics-by-design sign-off | Documented ethics review as a Phase VI deliverable | VI |

---

## 5. The 6-Phase Delivery Plan

Aligned to the contracted timeline (`TMT scope of work and delivery timeline`). Each phase lists the contracted deliverables, the concrete engineering work, and a definition of done.

### Phase I — Requirements, Co-Design & Use-Case Definition
**Timeline:** July 2026 · **Value:** $3,000

- **Deliverables:** COP co-design with stakeholders; admin dashboard requirements & workflows; multi-agency situational-awareness design (health/police/civil defense/hospitals); GIS layer + agency feed + hospital-resource mapping; requirements & use-case catalogue.
- **Engineering work:** Run co-design workshops with BZU + agencies; reconcile prototype capabilities against real requirements (gap log); define personas, roles, and RBAC matrix; agree the COP information model and map layers; kick off the DPIA.
- **Done when:** signed requirements catalogue, use-case list, COP wireframes/IA, RBAC matrix, and a prototype-vs-requirements gap register exist and are approved.

### Phase II — Architecture & Technical Design
**Timeline:** September 2026 · **Value:** $3,500

- **Deliverables:** technical architecture design; data-integration framework; GIS + external-systems integration architecture; security/scalability/resilience design; shared-codebase & sustainability framework.
- **Engineering work:** Formalize the target architecture (§3); **scoped refactor of prototype debt** (module boundaries, config, secrets, error handling) with a test-coverage gate; design integration adapters for hospital systems & agency feeds; stand up IaC (Terraform) + CI/CD skeleton + K8s/OpenShift target; finalize security & compliance design (§4); define the open/shared-codebase governance for handover.
- **Done when:** architecture decision records (ADRs) approved; CI/CD running on the repo; staging environment provisioned via IaC; refactor backlog triaged with a coverage baseline; security & data-integration designs signed off.

### Phase III — Core AI & Data Intelligence Development
**Timeline:** November 2026 · **Value:** $8,500 *(largest phase)*

- **Deliverables:** NLP + alert-triage models (P80–P100); severity assessment & prioritization engines; duplicate-report detection & clustering; social intelligence & misinformation monitoring; early-warning analytics; conversational AI (Arabic/English); RAG pipeline; explainable AI (SHAP) + human-in-the-loop.
- **Engineering work:** Add the multilingual fast-classifier in front of the CrewAI LLM crews; productionize the triage/scoring crews already in `services/ai_agent`; harden Qdrant-backed dedup/clustering; build the **ethical ingestion** layer (§3.2) replacing Telethon scraping; misinformation/trust scoring; SHAP explanations + HITL approval gates on high-severity actions; evaluation harness with labelled crisis data.
- **Done when:** models meet agreed precision/recall on a held-out set; explainability outputs render in the COP; HITL controls enforce human sign-off on critical automated alerts; ingestion runs only via the four ethical layers.

### Phase IV — Citizen Platform, Dashboards & User Experience
**Timeline:** January 2027 · **Value:** $4,000

- **Deliverables:** admin crisis dashboard; citizen mobile app; citizen web portal; guided SOS reporting; personalized crisis guidance & alerts; Arabic/English UIs; offline + SMS functionality.
- **Engineering work:** Productionize the existing React COP + responder + citizen views; finalize Capacitor mobile builds; complete the citizen web portal (PWA); harden offline/SMS fallback (Twilio/local gateway) and encrypted-SMS SOS path; bilingual + RTL accessibility (WCAG); personalized alerting.
- **Done when:** coordinator, hospital, responder, and citizen journeys are usable end-to-end in both languages; offline SOS verified with internet disabled; accessibility audit passed.

### Phase V — System Integration, Testing & Validation
**Timeline:** April 2027 · **Value:** $3,500

- **Deliverables:** integration with hospital systems & agency data feeds; real-time situational-awareness services; sprint reviews & validation cycles; system integration testing; UAT; performance & resilience testing.
- **Engineering work:** Wire hospital/agency integration adapters to real endpoints (or agreed sandboxes); load/performance testing of the live map + alert pipeline; chaos/resilience tests (node loss, broker failover); security testing/pen-test; structured UAT with BZU + agencies; finalize Data Processing Agreements.
- **Done when:** integration tests green against partner systems; performance targets met under load; UAT sign-off; resilience and security tests passed.

### Phase VI — Pilot-Ready Package, Knowledge Transfer & Sustainability
**Timeline:** July 2027 · **Value:** $9,500 *(second-largest — handover-heavy)*

- **Deliverables:** ethics-by-design implementation; documentation & user manuals; operator/admin training; knowledge-transfer sessions; capacity building; shared-codebase handover; technical support during pilot; sustainability & local-maintenance enablement.
- **Engineering work:** Finalize ethics review & compliance sign-off; complete docs (admin, operator, developer, deployment runbooks); deliver training + capacity-building; hand over the shared codebase with CI/CD and IaC; support the pilot deployment; document the sustainability/maintenance model for local ownership.
- **Done when:** documentation set delivered; trained operators demonstrably self-sufficient; codebase + infra handed over and reproducible by BZU's team; pilot running with support plan in place.

### Phase value distribution

| Phase | Focus | Value | Share |
|---|---|---|---|
| I | Requirements & co-design | $3,000 | 9% |
| II | Architecture & design | $3,500 | 11% |
| III | Core AI & data intelligence | $8,500 | 27% |
| IV | Citizen platform & UX | $4,000 | 12% |
| V | Integration, testing, validation | $3,500 | 11% |
| VI | Pilot, knowledge transfer, sustainability | $9,500 | 30% |
| **Total** | **Lot C** | **$32,000** | **100%** |

The weighting (III + VI ≈ 57%) confirms the strategy: the money is in the AI core and the handover/sustainability — **not** in re-laying foundations the prototype already provides.

---

## 6. Team & Ways of Working

- **Method:** Agile/Scrum (the proposal's stated competency), 2-week sprints, sprint reviews aligned to the validation cycles in Phase V.
- **Indicative roles:** AI/Systems Architect (tech lead) · 2× backend (FastAPI/AI) · 2× frontend/mobile (React/Capacitor) · 1× GIS/data engineer · 1× DevOps/SRE (IaC, K8s, CI/CD) · part-time DPO/compliance lead · QA · PM. Right-size to budget; several roles combine on a team of this size.
- **Environments:** dev → staging (IaC-provisioned) → pilot/prod, promoted via CI/CD.
- **Repo governance:** trunk-based with protected main, mandatory review + green CI, coverage gate established in Phase II.

---

## 7. Risk Register (Top Risks)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Reusing hackathon code drags in hidden debt | Med | High | Dedicated Phase II refactor + coverage gate; ADRs; gap register from Phase I |
| 2 | Legal exposure from ingestion / health data | Med | Critical | DPIA in Phase I; ethical 4-layer ingestion; DPAs; explicit consent; field encryption |
| 3 | Hospital/agency integration endpoints unavailable | High | High | Define adapters + sandboxes early (Phase II); contract data feeds in Phase I |
| 4 | AI model quality (Arabic dialects, false alarms) | Med | High | Fast-classifier + LLM two-stage; labelled eval set; HITL on critical actions |
| 5 | Single-vendor LLM lock-in / data sovereignty | Med | Med | Pluggable provider via litellm; option for self-hosted models |
| 6 | Scope creep from optional Lots A/B | Med | Med | Keep A/B off the committed critical path; treat reuse as bonus only |
| 7 | Connectivity in target zones (offline reality) | High | High | Offline-first PWA + encrypted SMS SOS (already prototyped); mesh route exists |
| 8 | Knowledge transfer / sustainability falls short | Med | High | Phase VI is 30% of value; runbooks, training, reproducible IaC handover |

---

## 8. Immediate Next Steps (Phase I kickoff — July 2026)

1. Stand up the requirements & co-design workshops with BZU + partner agencies.
2. Produce the **prototype-vs-requirements gap register** (formalizes §1.3 into a backlog).
3. Launch the **DPIA** and identify lawful basis + data-sharing agreement needs.
4. Lock the COP information model, map layers, personas, and RBAC matrix.
5. Spin up CI/CD + IaC skeleton and a staging environment (pulled forward from Phase II to de-risk early).

---

## 9. Appendix — Repo Reference Map

| Need | Where it lives today |
|---|---|
| Architecture narrative + diagrams | `docs/ARCHITECTURE.md` |
| Concept critique, ethics, feature ranking, user flows | `docs/PROJECT_ANALYSIS.md` |
| Stakeholder framing | `docs/STAKEHOLDER_TECHNICAL_BRIEF.md` |
| Backend app | `backend/app/` (models · services · api · telegram · db) |
| AI agents | `backend/app/services/ai_agent/` (agents, crews, embeddings, gap_detector, tools) |
| Frontend | `frontend/src/` (pages · components · native · store · hooks) |
| Local stack | `docker-compose.yml` |
| Simulation seed (Lot B, out of scope) | `crisis-simulator/`, `backend/.../simulation` |
