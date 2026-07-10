# TMT Backend — Security Review & Hardening Report

**Date:** 2026-07-10
**Scope:** Full backend (`app/api`, `app/services`, `app/models`, `app/db`, `app/main.py`, `app/config.py`, `tasks/`, deployment files) with fixes applied to the security-owned surface: `app/api/middleware/*`, `app/api/routes/auth.py`, `app/api/routes/privacy.py` (new), `app/main.py`, `app/config.py`, `requirements.txt`, `tests/`.
**Context:** GDPR / EU medical-data standards are a client priority. Gap items addressed: 11.2.5 (session invalidation), 11.2.6 (rate limiting), 11.3.2 (right to erasure), 11.3.3 (data portability).

**Verification:** No live DB/network available; every modified file passes `python3 -m py_compile`. Unit tests added under `tests/test_security_hardening.py` (in-memory stores, no infrastructure needed).

---

## Severity summary

| Severity | Fixed | Handoff | Accepted / documented |
|----------|-------|---------|-----------------------|
| Critical | 3     | 2       | —                     |
| High     | 4     | 3       | —                     |
| Medium   | 4     | 4       | 1                     |
| Low      | 3     | 3       | 2                     |

---

## CRITICAL

### C1 — FIXED · Weak JWT secret & encryption master key fallbacks
`app/config.py:25,30` (before fix) shipped `dev-jwt-secret-change-in-production` / `dev-master-key-change-in-production` as working defaults. Anyone reading the public repo could **forge admin JWTs** or decrypt medical data if the operator forgot to set env vars.
**Fix:** `app/config.py` now has a `model_validator` (`enforce_production_secrets`) that refuses to boot with `DEBUG=False` unless both secrets are non-placeholder and ≥ 32 chars. Defense-in-depth note: `docker-compose.yml` still injects the same weak fallbacks (see H-H2) and does **not** set `DEBUG=False` — production deployments MUST set `DEBUG=False` for the guard to fire.

### C2 — FIXED · No server-side session invalidation (feature 11.2.5)
Tokens lived 24 h with no way to kill a stolen/compromised session; deactivating a user did not invalidate cached tokens until the next DB check, and there was no logout.
**Fix (`app/api/middleware/auth.py`, `app/api/routes/auth.py`):**
- Every token now carries `jti` (unique id) + `iat` claims (`create_access_token`).
- `TokenRevocationStore` interface + `InMemoryTokenRevocationStore` (pluggable — swap via `set_revocation_store()` for Redis in multi-worker deploys).
- `get_current_user` checks the revocation list on every request (`check_token_revocation`).
- `POST /api/v1/auth/logout` — revokes the presented token's `jti` until natural expiry.
- `POST /api/v1/auth/users/{user_id}/revoke-tokens` (super admin) — force logout everywhere via issued-at cutoff; **legacy tokens without `iat`/`jti` are also killed** (missing `iat` treated as epoch 0).
- Both endpoints audit-logged.

### C3 — FIXED · python-jose 3.3.0 with known CVEs
`requirements.txt:10` pinned `python-jose[cryptography]==3.3.0`, affected by CVE-2024-33663 (algorithm-confusion signature bypass) and CVE-2024-33664 (JWE DoS).
**Fix:** bumped to `>=3.4.0,<4.0.0`. No API changes required.

### C4 — HANDOFF · Unauthenticated Socket.IO leaks live patient location + medical data
`app/api/websocket/handler.py:16` — `cors_allowed_origins="*"`; `handler.py:22` — `connect` accepts anyone; `handler.py:60` — `join_patient` lets any anonymous client join `patient_{id}` rooms. Combined with `app/api/routes/patients.py:478-499` (location updates broadcast name, phone, blood type, conditions, medications, emergency contacts), **any internet client can subscribe to real-time medical PII for any patient UUID**, and to all hospital/alert rooms.
**Owner:** websocket/handler.py owner. Suggested patch:
```python
# handler.py
from app.api.middleware.auth import decode_token

@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token")
    try:
        data = decode_token(token)          # raises HTTPException -> reject
    except Exception:
        raise socketio.exceptions.ConnectionRefusedError("authentication required")
    await sio.save_session(sid, {"user_id": data.user_id, "role": data.role,
                                 "patient_id": data.patient_id,
                                 "hospital_id": data.hospital_id})

@sio.event
async def join_patient(sid, data):
    sess = await sio.get_session(sid)
    if sess.get("patient_id") != data.get("patient_id") and sess.get("role") not in ("super_admin",):
        return  # refuse cross-patient subscription
    ...
```
Also set `cors_allowed_origins=settings.CORS_ORIGINS` and pass the JWT from the frontend socket client. `check_token_revocation` should be applied here too.

### C5 — HANDOFF · Live Telegram API credentials committed to the repo
`/.env.example:16-18` (repo root) contains what appear to be **real** values: `TELEGRAM_API_ID=23561985`, `TELEGRAM_API_HASH=741cc47560fd6e3d209e278be935fa6e`, and a personal phone number `TELEGRAM_PHONE=+970597488379`. `.env.example` is meant to be a template; these credentials grant MTProto app access and expose an employee's number.
**Owner:** repo admin. Action: rotate the API hash at my.telegram.org, blank the values in `.env.example`, purge from git history (`git filter-repo`), and confirm `tmt_session.session` files are git-ignored.

---

## HIGH

### H1 — FIXED · Rate limiting not production-shaped (feature 11.2.6)
`app/api/middleware/rate_limit.py` (before fix): per-IP only; trusted `X-Forwarded-For` unconditionally (line 73-78 — any client could rotate identities via a header to bypass limits and evade lockouts); opened a **new Redis connection per request** (lines 99-110, 148-159); unbounded in-memory fallback dict (line 26 — memory-exhaustion vector via key spraying); no per-user limits; login endpoints for patients/hospitals had no strict bucket at all.
**Fix (rewritten `rate_limit.py`):**
- `RateLimitStore` interface → `InMemoryRateLimitStore` (bounded: 50k keys, lazy pruning + cold-bucket eviction), `RedisRateLimitStore` (single shared connection pool), `ResilientStore` (prefers Redis, falls back to memory with 30 s cooldown — Redis-swappable per deployment via `set_store()`).
- Middleware layers: strict per-IP buckets on `POST /auth/login`, `/patients/login`, `/hospitals/login` (10/min), registration `POST /patients` (10/min), OTP endpoints `/telegram/auth/send-code|verify-code` (5/min); global per-IP (200/min); per-user (300/min, keyed by **signature-verified** JWT `sub`).
- Proper `429` with `Retry-After` (seconds until the oldest hit leaves the window) + `X-RateLimit-Limit/Remaining/Reset`; success responses carry `X-RateLimit-*`.
- `X-Forwarded-For` honoured only when `TRUST_PROXY_HEADERS=true` (new setting, default false).
- All limits configurable via settings (`RATE_LIMIT_*`); `/health` exempt; CORS preflights exempt; limiter is fail-open (an infrastructure fault can't take down SOS intake).
- Public contracts preserved: `rate_limit(max_requests, window_seconds, key_prefix)` dependency (used by `routes/sos.py`, `routes/auth.py`) plus new optional `per_user=` flag; `RateLimitMiddleware(app, max_requests, window_seconds)` unchanged.

### H2 — HANDOFF · docker-compose injects weak secrets and leaves DEBUG on
`docker-compose.yml:57-58,88` — `JWT_SECRET: ${JWT_SECRET:-dev-jwt-secret-change-in-production}` etc. Since compose never sets `DEBUG=False`, the new config guard (C1) will not fire in a naive prod compose deployment.
**Owner:** repo admin. Suggested patch: remove the `:-…` fallbacks so compose fails when the vars are unset, and add `DEBUG: "False"` to the backend service for production profiles.

### H3 — HANDOFF · Medical-record encryption at rest is not actually used
FEATURES.md 11.1.2 is marked ✅, but `encrypt_medical_data`/`decrypt_medical_data` had **zero call sites** (only the SMS helpers are used — `app/services/sms_service.py:27`). `app/models/medical_record.py:19` has an `encrypted_data` column that is never written; conditions/medications/notes are stored as plaintext JSONB (`app/api/routes/records.py`, `app/services/patient_service.py`).
**Owner:** records/patient_service owners. The helpers are now AES-256-GCM (authenticated; legacy CBC blobs still decrypt — see M4), so wiring is straightforward, e.g. in the record-create path:
```python
from app.api.middleware.encryption import encrypt_medical_data
record.encrypted_data = encrypt_medical_data(json.dumps({"notes": payload.notes}).encode())
record.notes = None  # stop persisting plaintext
```

### H4 — HANDOFF · `/sms/test` allows spoofing an SOS for any patient; Twilio verification is skippable
`app/api/routes/sms.py:165-217` — no auth, gated only on `settings.DEBUG`, which **defaults to True** (`app/config.py`); anyone can trigger SOS flows for any phone number. `sms.py:71-73` — Twilio signature verification silently passes when `TWILIO_AUTH_TOKEN` is empty, so `/sms/inbound` accepts forged webhooks in any deployment that hasn't configured Twilio.
**Owner:** sms.py owner. Suggested patch: require `require_role(UserRole.SUPER_ADMIN)` on `/sms/test` in addition to DEBUG; in `_verify_twilio_signature`, return `False` (or 503) when the token is missing and the app is not in DEBUG. Interim mitigations delivered on my side: strict auth/OTP rate buckets, and the C1 guard nudges DEBUG=False deployments.

### H5 — FIXED · Login user-enumeration via timing + no auth audit trail
`app/api/routes/auth.py:51` (before fix) only ran bcrypt when the account existed — a ~100-200 ms timing oracle for valid phone numbers. No audit records for login success/failure (11.4.3 "multiple failed logins" detection has nothing to read).
**Fix:** `verify_password_safe()` in `middleware/auth.py` verifies a pre-computed dummy hash when the user is missing (constant work); `/auth/login` now audit-logs `login_success` / `login_failed` / `login_denied` with **masked** phone numbers (`mask_phone`). Same fix recommended for the two other login routes (see M2).

### H6 — FIXED (new capability) · GDPR Art. 17 & Art. 20 endpoints missing (11.3.2 / 11.3.3)
No way for a patient to erase or export their data.
**Fix — new `app/api/routes/privacy.py`, wired in `app/main.py`:**
- `GET /api/v1/privacy/export` (auth required, 5/h per user): machine-readable JSON of the caller's user record, patient profile, medical records, SOS history, SMS logs, and audit trail (capped 5000 entries), served with `Content-Disposition: attachment` + `Cache-Control: no-store`. Audit-logged as `export`.
- `DELETE /api/v1/privacy/me?confirm=true` (patient accounts only, 5/h): hard-deletes medical records and SMS logs; **scrubs** SOS rows (`details`, `triage_transcript` → NULL) while keeping them for Art. 17(3) emergency/legal retention (the FK is NOT NULL); anonymizes the patient row in place (name/phone placeholders, all demographics/medical/location/contact fields cleared, consent cleared, deactivated) and the user account (placeholder phone, no email, unusable password, inactive); revokes all tokens; audit-logged as `erasure` with pseudonymous UUIDs only. Facility/admin accounts get 403 with instructions (super admin must remove them — facility records depend on those users).

---

## MEDIUM

### M1 — FIXED · JWT/auth middleware robustness
`app/api/middleware/auth.py:73` (before fix): `UUID(token_data.user_id)` raised `ValueError` → HTTP 500 for a crafted `sub` claim; missing claims raised `KeyError` → 500.
**Fix:** malformed subject / missing claims now return 401; `decode_token` catches `JWTError, KeyError, ValueError`.

### M2 — HANDOFF · Duplicate login endpoints lack the timing fix
`app/api/routes/patients.py:243-279` and `app/api/routes/hospitals.py:214-249` re-implement login with the same timing-oracle pattern and no audit logging. They now sit behind the middleware's strict auth buckets (H1), which caps brute force, but the enumeration side-channel remains.
**Owner:** patients.py / hospitals.py owners. Suggested patch: replace `user is None or not verify_password(...)` with `not verify_password_safe(payload.password, user.hashed_password if user else None)` (import from `app.api.middleware.auth`) and add `log_audit(action="login_failed", ...)` — both helpers already exist. Longer term: deprecate these in favour of `/auth/login`.

### M3 — HANDOFF · `register_hospital` privilege model + crash bug
`app/api/routes/hospitals.py:142-148` — any `hospital_admin` can create new facilities **and admin users for any department** (police/civil-defense), i.e. lateral admin-account minting; should be super-admin only (an equivalent super-admin path already exists in `admin.py`). Also `hospitals.py:206` calls `str(hospital.id)` but `create_hospital` returns a dict → `AttributeError`/500 on every successful registration (use `hospital["id"]`).
**Owner:** hospitals.py owner.

### M4 — FIXED · Medical-data cipher was unauthenticated (CBC without MAC)
`app/api/middleware/encryption.py:23-42` (before fix) used AES-256-CBC with no integrity check — malleable ciphertext and padding-oracle risk once wired up.
**Fix:** `encrypt_medical_data` now emits versioned AES-256-GCM (`TMTE2:` magic + nonce + AEAD ciphertext, bound to an AAD label); `decrypt_medical_data` verifies authenticity and transparently falls back to the legacy CBC format for pre-existing blobs. Safe to deploy now because nothing has written the old format yet (H3).

### M5 — FIXED · Audit logger could break requests and had no PII hygiene
`app/api/middleware/audit.py` (before fix): crashed with `AttributeError` when called without a `db` session; any flush error propagated into the business request; raw phone numbers were being embedded in `details` (e.g. `sms.py:152`), conflicting with pseudonymization (11.3.7).
**Fix:** `log_audit` is now fail-open (logs the failure, never raises), guards `db=None`, truncates user agents, honours `TRUST_PROXY_HEADERS` for `ip_address`, and exports `mask_phone` / `mask_email` helpers (used by the new auth/privacy routes; other route owners should adopt them — e.g. `sms.py:152` logs the raw phone today).

### M6 — HANDOFF · SQL echo logs PII when DEBUG is on
`app/db/postgres.py:8` — `echo=settings.DEBUG` writes full SQL statements (patient names, phones, medical JSON) to stdout logs; DEBUG defaults to True.
**Owner:** db owner. Suggested patch: `echo=False` unconditionally, or gate on a dedicated `SQL_ECHO` setting; ensure prod log pipelines treat app logs as containing PII until then.

### M7 — HANDOFF · Seeded weak credentials
`seed.py:754,788,873,926` — `superadmin123`, `admin123456`, `patient123456` with predictable phone patterns (also printed at `seed.py:1371`). Fine for dev; catastrophic if seeding runs against prod.
**Owner:** seed.py owner. Suggested patch: generate random passwords and print once, or refuse to run when `DEBUG=False`.

### M8 — ACCEPTED / DOCUMENTED · Department admins can read any patient (break-glass)
`app/api/routes/patients.py:150-164` — `_check_patient_access` grants all department admins (hospital/police/civil-defense) access to every patient record; reads are audit-logged (`patients.py:299-307`). For an emergency-response platform this is a deliberate break-glass design; GDPR-wise it is defensible **only** because of the audit trail. Recommend: periodic audit review (11.4.4) and facility-scoped narrowing where feasible.

---

## LOW

### L1 — FIXED · Global limiter counted CORS preflights and health probes
The old middleware rate-limited `OPTIONS` preflights and `/health`, letting an attacker starve monitoring, and browsers burn the budget. Both are now exempt.

### L2 — FIXED · Tokens carried no issued-at / unique id
Beyond revocation (C2), `iat`/`jti` give the audit trail token-level attribution.

### L3 — HANDOFF · CORS is permissive within allow-listed origins
`app/main.py:31-37` — `allow_methods=["*"]`, `allow_headers=["*"]` with `allow_credentials=True`. Origins are an explicit allow-list (good), so exposure is limited; tighten methods/headers when convenient. Note `http://localhost` / `capacitor://localhost` must remain for the mobile shell.

### L4 — HANDOFF · Frontend stores JWT in `localStorage`
`frontend/src/**` (e.g. `pages/admin/AdminDashboard.tsx:49`, key `tmt-token`; `native/bridgefyService.ts:586`, key `tmt-auth-token`) — XSS-readable storage, and logout is client-side only. The new `POST /api/v1/auth/logout` should be called on sign-out so the server invalidates the session; consider httpOnly cookies for the web dashboard later. (Frontend is read-only for this review.)

### L5 — INFO · Raw SQL in startup migrations is safe
`app/main.py:62-305` builds `ALTER TABLE …` strings via f-strings, but every interpolated value is a hardcoded constant — no user input reaches them. All query paths elsewhere use SQLAlchemy ORM parameterization; the single `text()` outside main.py is a jsonb helper (`analytics_service.py:315`). **No SQL-injection surfaces found.**

### L6 — INFO · 24 h token lifetime, no refresh rotation
FEATURES 11.2.1 claims "short-lived access tokens with refresh token rotation" — there is no refresh endpoint; a single 24 h access token is issued. jti revocation (C2) now compensates, and `JWT_EXPIRATION_MINUTES` is env-tunable. Recommend a follow-up: 15-60 min access tokens + rotating refresh tokens.

---

## New/changed API surface (all additive, existing contracts preserved)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/logout` | Bearer | Revoke the presented token (11.2.5) |
| POST | `/api/v1/auth/users/{user_id}/revoke-tokens` | super_admin | Force logout a user everywhere (11.2.5) |
| GET | `/api/v1/privacy/export` | Bearer | GDPR Art. 20 data portability (11.3.3) |
| DELETE | `/api/v1/privacy/me?confirm=true` | patient | GDPR Art. 17 right to erasure (11.3.2) |

`POST /auth/login` request/response shapes are unchanged. 429 responses now include `Retry-After` and `X-RateLimit-*` headers everywhere.

## Files changed

- `app/config.py` — production secret guard, `TRUST_PROXY_HEADERS`, `RATE_LIMIT_*` settings
- `app/api/middleware/rate_limit.py` — rewritten (store interface, per-IP + per-user, auth/OTP buckets, Retry-After)
- `app/api/middleware/auth.py` — jti/iat claims, revocation store interface + checks, `verify_password_safe`, 401 hardening
- `app/api/middleware/audit.py` — fail-open, PII masking helpers, proxy-aware IP
- `app/api/middleware/encryption.py` — AES-256-GCM for medical data (legacy CBC read-compat)
- `app/api/routes/auth.py` — timing-safe login, auth audit trail, logout + admin revoke endpoints
- `app/api/routes/privacy.py` — **new**: GDPR export + erasure
- `app/main.py` — privacy router include; settings-driven rate-limit registration (additive only)
- `requirements.txt` — python-jose CVE bump (no new dependencies added)
- `tests/test_security_hardening.py` — **new**: 22 tests for the above

## Deployment checklist (ops)

1. Set `DEBUG=False`, a random `JWT_SECRET` (≥32 chars) and `ENCRYPTION_MASTER_KEY` (≥32 chars) — the app now refuses to boot otherwise.
2. Set `TRUST_PROXY_HEADERS=true` **only** behind a trusted reverse proxy.
3. Rotate the leaked Telegram credentials (C5) before anything else.
4. `pip install -r requirements.txt` to pick up python-jose ≥ 3.4.0.
5. Multi-worker deployments: provide Redis (`REDIS_URL`) — the rate limiter uses it automatically; plug a Redis-backed `TokenRevocationStore` via `set_revocation_store()` for cross-worker logout.
