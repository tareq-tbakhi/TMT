import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from app.config import get_settings
from app.db.postgres import engine, Base
from sqlalchemy import text
import app.models  # noqa: F401 — register all ORM models with Base.metadata

logger = logging.getLogger(__name__)
from app.api.routes import patients, hospitals, records, alerts, analytics, sos, sms, livemap, auth, admin, aid_requests, transfers, simulation, telegram, news, mesh, sync
from app.api.websocket.handler import sio

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting (must be added before CORS so it runs after CORS in the middleware stack)
from app.api.middleware.rate_limit import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware, max_requests=200, window_seconds=60)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO integration
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# API routes
app.include_router(auth.router, prefix=settings.API_PREFIX, tags=["Auth"])
app.include_router(admin.router, prefix=settings.API_PREFIX, tags=["Admin"])
app.include_router(patients.router, prefix=settings.API_PREFIX, tags=["Patients"])
app.include_router(hospitals.router, prefix=settings.API_PREFIX, tags=["Hospitals"])
app.include_router(records.router, prefix=settings.API_PREFIX, tags=["Medical Records"])
app.include_router(alerts.router, prefix=settings.API_PREFIX, tags=["Alerts"])
app.include_router(analytics.router, prefix=settings.API_PREFIX, tags=["Analytics"])
app.include_router(sos.router, prefix=settings.API_PREFIX, tags=["SOS"])
app.include_router(sms.router, prefix=settings.API_PREFIX, tags=["SMS"])
app.include_router(livemap.router, prefix=settings.API_PREFIX, tags=["Live Map"])
app.include_router(aid_requests.router, prefix=settings.API_PREFIX, tags=["Aid Requests"])
app.include_router(transfers.router, prefix=settings.API_PREFIX, tags=["Transfers"])
app.include_router(simulation.router, prefix=settings.API_PREFIX, tags=["Simulation"])
app.include_router(telegram.router, prefix=settings.API_PREFIX, tags=["Telegram"])
app.include_router(news.router, prefix=settings.API_PREFIX, tags=["News"])
app.include_router(mesh.router, prefix=settings.API_PREFIX, tags=["Mesh Network"])
app.include_router(sync.router, prefix=settings.API_PREFIX, tags=["Offline Sync"])


@app.on_event("startup")
async def startup():
    # Step 1: Create all tables (own transaction — must not be poisoned)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Initialize Qdrant collection
    try:
        from app.db.qdrant import init_qdrant
        init_qdrant()
        logger.info("Qdrant collection initialized")
    except Exception as e:
        logger.warning(f"Qdrant init failed (non-fatal): {e}")

    # Step 2: Add enum value (own transaction — ALTER TYPE ADD VALUE can fail
    # inside a transaction on some PG versions; isolate it so it can't
    # rollback the table creation above)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'super_admin'"))
    except Exception:
        pass

    # Step 3: Data migrations (own transaction)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE users SET role = 'hospital_admin' WHERE role = 'doctor'"))
    except Exception:
        pass

    # Step 4: Add contact fields to hospitals table (idempotent)
    try:
        async with engine.begin() as conn:
            for col in ["email", "address", "website"]:
                await conn.execute(text(
                    f"ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS {col} VARCHAR"
                ))
    except Exception:
        pass

    # Step 5: Add trust tracking columns to patients table (idempotent)
    try:
        async with engine.begin() as conn:
            for col, typ, default in [
                ("false_alarm_count", "INTEGER", "0"),
                ("total_sos_count", "INTEGER", "0"),
                ("trust_score", "FLOAT", "1.0"),
            ]:
                await conn.execute(text(
                    f"ALTER TABLE patients ADD COLUMN IF NOT EXISTS {col} {typ} DEFAULT {default}"
                ))
    except Exception:
        pass

    # Step 6: Add Gender enum type (own transaction for CREATE TYPE)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "DO $$ BEGIN "
                "  CREATE TYPE gender AS ENUM ('male', 'female', 'other'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
    except Exception:
        pass

    # Step 7: Add medical / demographic fields to patients table (idempotent)
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender gender",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id VARCHAR",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_language VARCHAR DEFAULT 'ar'",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS location_name VARCHAR",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS height_cm FLOAT",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS weight_kg FLOAT",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS chronic_conditions JSONB DEFAULT '[]'::jsonb",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies JSONB DEFAULT '[]'::jsonb",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS current_medications JSONB DEFAULT '[]'::jsonb",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS special_equipment JSONB DEFAULT '[]'::jsonb",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_info VARCHAR",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes VARCHAR",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 8: Add live-location tracking columns to sos_requests (idempotent)
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS origin_hospital_id UUID REFERENCES hospitals(id)",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS auto_resolved BOOLEAN DEFAULT FALSE",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 8b: Add mesh relay columns to sos_requests (Bridgefy integration)
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS mesh_message_id VARCHAR",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS mesh_relay_device_id VARCHAR",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS mesh_hop_count INTEGER",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS mesh_relay_timestamp TIMESTAMP",
                "CREATE INDEX IF NOT EXISTS idx_sos_mesh_message_id ON sos_requests(mesh_message_id)",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 8c: Add MESH value to sossource enum (for Bridgefy integration)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TYPE sossource ADD VALUE IF NOT EXISTS 'mesh'"))
    except Exception:
        pass

    # Step 9: Add AI risk scoring columns to patients table (idempotent)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "DO $$ BEGIN "
                "  CREATE TYPE risklevel AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
    except Exception:
        pass
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS risk_score FLOAT DEFAULT 0.0",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS risk_level risklevel DEFAULT 'LOW'",
                "ALTER TABLE patients ADD COLUMN IF NOT EXISTS risk_updated_at TIMESTAMP",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 10: Multi-department support — create department_type enum
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "DO $$ BEGIN "
                "  CREATE TYPE department_type AS ENUM ('hospital', 'police', 'civil_defense'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
    except Exception:
        pass

    # Step 11: Add new user roles (police_admin, civil_defense_admin)
    for role_val in ["police_admin", "civil_defense_admin"]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(
                    f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{role_val}'"
                ))
        except Exception:
            pass

    # Step 12: Add department_type + police/civil-defense columns to hospitals table
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS department_type department_type DEFAULT 'hospital'",
                # Police-specific
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS patrol_units INTEGER DEFAULT 0",
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS available_units INTEGER DEFAULT 0",
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS jurisdiction_area VARCHAR",
                # Civil defense-specific
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS rescue_teams INTEGER DEFAULT 0",
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS available_teams INTEGER DEFAULT 0",
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS equipment_types JSONB DEFAULT '[]'::jsonb",
                "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS shelter_capacity INTEGER DEFAULT 0",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 13: Add multi-department routing columns to sos_requests
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS routed_department VARCHAR",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS facility_notified_id UUID REFERENCES hospitals(id)",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES sos_requests(id)",
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS transfer_reason VARCHAR",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 14: Add multi-department routing columns to alerts
    try:
        async with engine.begin() as conn:
            for stmt in [
                "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS routed_department VARCHAR",
                "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS target_facility_id UUID REFERENCES hospitals(id)",
            ]:
                await conn.execute(text(stmt))
    except Exception:
        pass

    # Step 15: Create case_transfers table (idempotent via CREATE TABLE IF NOT EXISTS)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "DO $$ BEGIN "
                "  CREATE TYPE transferstatus AS ENUM ('pending', 'accepted', 'rejected'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
    except Exception:
        pass
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS case_transfers (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    sos_request_id UUID NOT NULL REFERENCES sos_requests(id),
                    alert_id UUID REFERENCES alerts(id),
                    from_facility_id UUID NOT NULL REFERENCES hospitals(id),
                    to_facility_id UUID NOT NULL REFERENCES hospitals(id),
                    from_department VARCHAR NOT NULL,
                    to_department VARCHAR NOT NULL,
                    reason VARCHAR,
                    status transferstatus DEFAULT 'pending',
                    transferred_by UUID NOT NULL REFERENCES users(id),
                    accepted_by UUID REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT NOW(),
                    resolved_at TIMESTAMP
                )
            """))
    except Exception:
        pass

    # Step 16: Add triage_transcript JSONB column to sos_requests (idempotent)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE sos_requests ADD COLUMN IF NOT EXISTS triage_transcript JSONB"
            ))
    except Exception:
        pass

    # Telegram initialization (non-blocking, skip if not configured)
    if settings.TELEGRAM_API_ID and settings.TELEGRAM_API_HASH and settings.TELEGRAM_PHONE:
        from pathlib import Path
        session_file = Path("tmt_session.session")
        if not session_file.exists():
            logger.info(
                "Telegram credentials configured but session file not found. "
                "Use the Connect button in the Social Media page to authenticate."
            )
        else:
            async def _init_telegram():
                from app.telegram.client import get_telegram_client, setup_message_handler
                from app.telegram.message_handler import on_telegram_message

                logger.info("Starting Telegram initialization…")
                # Retry a few times in case the session file is briefly
                # locked by a Celery worker starting at the same time.
                for attempt in range(5):
                    try:
                        client = await get_telegram_client()
                        if client.is_connected():
                            handler_registrar = setup_message_handler(on_telegram_message)
                            await handler_registrar()
                            logger.info(
                                "Telegram initialised — client connected, "
                                "handler registered, monitor started"
                            )
                            return
                        else:
                            logger.warning("Telegram client created but NOT connected")
                            return
                    except Exception as e:
                        if attempt < 4:
                            logger.warning(
                                "Telegram init attempt %d/5 failed (%s), retrying in 5 s…",
                                attempt + 1, e,
                            )
                            await asyncio.sleep(5)
                        else:
                            logger.error(
                                "Telegram init failed after 5 attempts (non-fatal): %s", e
                            )

            asyncio.create_task(_init_telegram())
    else:
        logger.info("Telegram credentials not configured, skipping initialization")


@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.APP_NAME}


# Mount Socket.IO
app = sio_app
