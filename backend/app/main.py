from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from app.config import get_settings
from app.db.postgres import engine, Base
from sqlalchemy import text
from app.api.routes import patients, hospitals, records, alerts, analytics, sos, sms, livemap, auth, admin, aid_requests
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
app.include_router(aid_requests.router, prefix=settings.API_PREFIX, tags=["Aid Requests"])


@app.on_event("startup")
async def startup():
    # Step 1: Create all tables (own transaction — must not be poisoned)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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


@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.APP_NAME}


# Mount Socket.IO
app = sio_app
