import socketio

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")


@sio.event
async def join_hospital(sid, data):
    """Hospital joins its room for targeted alerts."""
    hospital_id = data.get("hospital_id")
    if hospital_id:
        sio.enter_room(sid, f"hospital_{hospital_id}")
        await sio.emit("joined", {"room": f"hospital_{hospital_id}"}, to=sid)


@sio.event
async def join_alerts(sid, data=None):
    """Join the global alerts room."""
    sio.enter_room(sid, "alerts")
    await sio.emit("joined", {"room": "alerts"}, to=sid)


@sio.event
async def join_map(sid, data=None):
    """Join the live map room for real-time geo events."""
    sio.enter_room(sid, "livemap")
    await sio.emit("joined", {"room": "livemap"}, to=sid)


@sio.event
async def join_patient(sid, data):
    """Patient joins their personal room for alerts."""
    patient_id = data.get("patient_id")
    if patient_id:
        sio.enter_room(sid, f"patient_{patient_id}")
        await sio.emit("joined", {"room": f"patient_{patient_id}"}, to=sid)


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
    await sio.emit("map_event", {
        "type": "hospital_status",
        "data": hospital_data,
    }, room="livemap")


async def notify_patient(patient_id: str, alert_data: dict):
    """Send alert to a specific patient."""
    await sio.emit("patient_alert", alert_data, room=f"patient_{patient_id}")


async def broadcast_sos(sos_data: dict):
    """Broadcast SOS to all connected dashboards and map."""
    await sio.emit("new_sos", sos_data, room="alerts")
    await sio.emit("map_event", {
        "type": "sos",
        "data": sos_data,
    }, room="livemap")
