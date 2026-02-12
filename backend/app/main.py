from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from app.config import get_settings
from app.db.postgres import engine, Base
from app.api.routes import patients, hospitals, records, alerts, analytics, sos, sms, livemap
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
sio_app = socketio.ASGIApp(sio, other_app=app)

# API routes
app.include_router(patients.router, prefix=settings.API_PREFIX, tags=["Patients"])
app.include_router(hospitals.router, prefix=settings.API_PREFIX, tags=["Hospitals"])
app.include_router(records.router, prefix=settings.API_PREFIX, tags=["Medical Records"])
app.include_router(alerts.router, prefix=settings.API_PREFIX, tags=["Alerts"])
app.include_router(analytics.router, prefix=settings.API_PREFIX, tags=["Analytics"])
app.include_router(sos.router, prefix=settings.API_PREFIX, tags=["SOS"])
app.include_router(sms.router, prefix=settings.API_PREFIX, tags=["SMS"])
app.include_router(livemap.router, prefix=settings.API_PREFIX, tags=["Live Map"])


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.APP_NAME}


# Mount Socket.IO
app = sio_app
