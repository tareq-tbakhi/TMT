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
from app.api.routes import patients, hospitals, records, alerts, analytics, sos, sms, livemap, auth, admin, telegram
from app.api.websocket.handler import sio

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

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
app.include_router(telegram.router, prefix=settings.API_PREFIX, tags=["Telegram"])


@app.on_event("startup")
async def startup():
    # Create tables in its own transaction
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Initialize Qdrant collection
    try:
        from app.db.qdrant import init_qdrant
        init_qdrant()
        logger.info("Qdrant collection initialized")
    except Exception as e:
        logger.warning(f"Qdrant init failed (non-fatal): {e}")

    # Run migrations in a separate transaction to avoid conflicts with
    # ALTER TYPE ... ADD VALUE (which can abort the DDL transaction)
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'super_admin'"))
        except Exception:
            pass  # Already exists or enum not yet created

    async with engine.begin() as conn:
        try:
            await conn.execute(text("UPDATE users SET role = 'hospital_admin' WHERE role = 'doctor'"))
        except Exception:
            pass

        for col, typ, default in [
            ("false_alarm_count", "INTEGER", "0"),
            ("total_sos_count", "INTEGER", "0"),
            ("trust_score", "FLOAT", "1.0"),
        ]:
            try:
                await conn.execute(text(
                    f"ALTER TABLE patients ADD COLUMN IF NOT EXISTS {col} {typ} DEFAULT {default}"
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

                # Retry a few times in case the session file is briefly
                # locked by a Celery worker starting at the same time.
                for attempt in range(5):
                    try:
                        client = await get_telegram_client()
                        if client.is_connected():
                            handler_registrar = setup_message_handler(on_telegram_message)
                            await handler_registrar()
                            logger.info("Telegram initialized successfully")
                            return
                        else:
                            logger.warning("Telegram client created but not connected")
                            return
                    except Exception as e:
                        if attempt < 4:
                            logger.info(f"Telegram init attempt {attempt + 1} failed ({e}), retrying in 5s...")
                            await asyncio.sleep(5)
                        else:
                            logger.warning(f"Telegram init failed after 5 attempts (non-fatal): {e}")

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
