import uuid
import logging
from datetime import datetime, timezone

import socketio

from app.config import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()

# Use Redis manager so Celery workers can emit events via the same bus
_redis_mgr = socketio.AsyncRedisManager(_settings.REDIS_URL)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    client_manager=_redis_mgr,
)


@sio.event
async def connect(sid, environ):
    logger.info("Socket.IO client connected: %s", sid)


@sio.event
async def disconnect(sid):
    logger.info("Socket.IO client disconnected: %s", sid)


@sio.event
async def join_hospital(sid, data):
    """Hospital/facility joins its room for targeted alerts."""
    hospital_id = data.get("hospital_id")
    if hospital_id:
        await sio.enter_room(sid, f"hospital_{hospital_id}")
        await sio.emit("joined", {"room": f"hospital_{hospital_id}"}, to=sid)
    # Also join department-specific room
    department = data.get("department_type") or data.get("facility_type")
    if department:
        await sio.enter_room(sid, f"dept_{department}")
        await sio.emit("joined", {"room": f"dept_{department}"}, to=sid)


@sio.event
async def join_alerts(sid, data=None):
    """Join the global alerts room."""
    await sio.enter_room(sid, "alerts")
    await sio.emit("joined", {"room": "alerts"}, to=sid)


@sio.event
async def join_map(sid, data=None):
    """Join the live map room for real-time geo events."""
    await sio.enter_room(sid, "livemap")
    await sio.emit("joined", {"room": "livemap"}, to=sid)


@sio.event
async def join_patient(sid, data):
    """Patient joins their personal room for alerts."""
    patient_id = data.get("patient_id")
    if patient_id:
        await sio.enter_room(sid, f"patient_{patient_id}")
        await sio.emit("joined", {"room": f"patient_{patient_id}"}, to=sid)


@sio.event
async def join_telegram(sid, data=None):
    """Join the Telegram real-time feed room."""
    await sio.enter_room(sid, "telegram")
    await sio.emit("joined", {"room": "telegram"}, to=sid)
    logger.info("Client %s joined 'telegram' room", sid)


# --- Broadcast functions (called from services) ---

async def broadcast_alert(alert_data: dict):
    """Push a new alert to all connected hospital dashboards."""
    await sio.emit("new_alert", alert_data, room="alerts")


async def broadcast_map_event(event_data: dict):
    """Push a new geo event to all Live Map clients."""
    await sio.emit("map_event", event_data, room="livemap")


async def broadcast_hospital_status(hospital_data: dict):
    """Push hospital status update to all clients."""
    await sio.emit("hospital_status", hospital_data, room="alerts")
    # Emit as a proper MapEvent so the LiveMap can render it
    lat = hospital_data.get("latitude")
    lon = hospital_data.get("longitude")
    if lat is not None and lon is not None:
        await sio.emit("map_event", {
            "id": f"ws-hosp-{hospital_data.get('hospital_id', uuid.uuid4().hex[:8])}",
            "event_type": "hospital_status",
            "latitude": lat,
            "longitude": lon,
            "source": "system",
            "severity": 1,
            "title": f"{hospital_data.get('name', 'Hospital')} — {hospital_data.get('status', 'unknown')}",
            "details": f"Beds: {hospital_data.get('available_beds', '?')}, ICU: {hospital_data.get('icu_beds', '?')}",
            "layer": "hospital",
            "metadata": {"status": hospital_data.get("status", "operational")},
            "created_at": hospital_data.get("updated_at", datetime.now(timezone.utc).isoformat()),
            "expires_at": None,
        }, room="livemap")


async def notify_patient(patient_id: str, alert_data: dict):
    """Send alert to a specific patient."""
    await sio.emit("patient_alert", alert_data, room=f"patient_{patient_id}")


async def broadcast_sos(sos_data: dict):
    """Broadcast SOS to all connected dashboards and map."""
    await sio.emit("new_sos", sos_data, room="alerts")
    # Emit as a proper MapEvent so the LiveMap can render it
    lat = sos_data.get("latitude")
    lon = sos_data.get("longitude")
    if lat is not None and lon is not None:
        await sio.emit("map_event", {
            "id": f"ws-sos-{sos_data.get('id', uuid.uuid4().hex[:8])}",
            "event_type": "medical_emergency",
            "latitude": lat,
            "longitude": lon,
            "source": sos_data.get("source", "app"),
            "severity": sos_data.get("severity", 4),
            "title": f"SOS — {sos_data.get('patient_status', 'unknown')}",
            "details": sos_data.get("details"),
            "layer": "sos",
            "metadata": {
                "patient_id": sos_data.get("patient_id"),
                "patient_status": sos_data.get("patient_status"),
                "patient_info": sos_data.get("patient_info"),
            },
            "created_at": sos_data.get("created_at", datetime.now(timezone.utc).isoformat()),
            "expires_at": None,
        }, room="livemap")


async def broadcast_aid_request(aid_request_data: dict):
    """Broadcast new aid request to all connected dashboards."""
    await sio.emit("new_aid_request", aid_request_data, room="alerts")


async def broadcast_patient_location(location_data: dict):
    """Push a patient location update to dashboards, live map, and the patient's room."""
    await sio.emit("patient_location", location_data, room="alerts")
    patient_id = location_data.get("patient_id")
    if patient_id:
        await sio.emit("patient_location", location_data, room=f"patient_{patient_id}")
    lat = location_data.get("latitude")
    lon = location_data.get("longitude")
    if lat is not None and lon is not None:
        await sio.emit("map_event", {
            "id": f"ws-loc-{patient_id or uuid.uuid4().hex[:8]}",
            "event_type": "patient_location",
            "latitude": lat,
            "longitude": lon,
            "source": "app",
            "severity": 1,
            "title": f"Patient: {location_data.get('patient_name', 'Unknown')}",
            "details": None,
            "layer": "patient",
            "metadata": {
                "patient_id": patient_id,
                "patient_name": location_data.get("patient_name"),
                "patient_info": location_data.get("patient_info"),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": None,
        }, room="livemap")


async def broadcast_transfer(transfer_data: dict):
    """Broadcast transfer notifications to source and target facilities/departments."""
    from_fid = transfer_data.get("from_facility_id")
    to_fid = transfer_data.get("to_facility_id")
    if from_fid:
        await sio.emit("transfer_outgoing", transfer_data, room=f"hospital_{from_fid}")
    if to_fid:
        await sio.emit("transfer_incoming", transfer_data, room=f"hospital_{to_fid}")
    # Also broadcast to alerts room for super admin
    await sio.emit("new_transfer", transfer_data, room="alerts")


async def broadcast_sos_resolved(resolution_data: dict):
    """Broadcast SOS auto-resolution to dashboards and the patient's room."""
    await sio.emit("sos_resolved", resolution_data, room="alerts")
    patient_id = resolution_data.get("patient_id")
    if patient_id:
        await sio.emit("sos_resolved", resolution_data, room=f"patient_{patient_id}")
    lat = resolution_data.get("latitude")
    lon = resolution_data.get("longitude")
    if lat is not None and lon is not None:
        await sio.emit("map_event", {
            "id": f"ws-res-{resolution_data.get('sos_id', uuid.uuid4().hex[:8])}",
            "event_type": "sos_resolved",
            "latitude": lat,
            "longitude": lon,
            "source": "system",
            "severity": 1,
            "title": "SOS auto-resolved — patient at hospital",
            "details": resolution_data.get("hospital_name"),
            "layer": "sos",
            "metadata": {
                "patient_id": patient_id,
                "sos_id": resolution_data.get("sos_id"),
                "hospital_id": resolution_data.get("hospital_id"),
                "auto_resolved": True,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": None,
        }, room="livemap")


async def broadcast_telegram_message(msg_data: dict):
    """Push a new Telegram message to all connected dashboards."""
    await sio.emit("telegram_message", msg_data, room="telegram")


async def broadcast_telegram_analysis(analysis_data: dict):
    """Push AI analysis result for a Telegram message."""
    await sio.emit("telegram_analysis", analysis_data, room="telegram")


async def broadcast_telegram_processing(processing_data: dict):
    """Notify dashboards that a message is being processed by AI."""
    await sio.emit("telegram_processing", processing_data, room="telegram")
