"""
Simulation broadcast endpoint — allows the crisis simulator to push
real-time WebSocket events after bulk DB inserts.
"""

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.api.middleware.auth import require_role
from app.api.websocket.handler import broadcast_sos, broadcast_map_event

router = APIRouter()


class SosItem(BaseModel):
    id: str
    patient_id: Optional[str] = None
    latitude: float
    longitude: float
    status: str = "PENDING"
    patient_status: str = "INJURED"
    severity: int = 4
    source: str = "API"
    details: Optional[str] = None
    created_at: Optional[str] = None
    routed_department: Optional[str] = None


class SimBroadcastRequest(BaseModel):
    sos_items: list[SosItem] = []


@router.post("/simulation/broadcast")
async def broadcast_sim_batch(
    payload: SimBroadcastRequest,
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Broadcast SOS events via WebSocket after simulator bulk DB inserts.

    Each SOS item is emitted as both ``new_sos`` (dashboards) and
    ``map_event`` (live map), triggering real-time UI updates.
    """
    broadcast_count = 0
    for item in payload.sos_items:
        await broadcast_sos(item.model_dump())
        broadcast_count += 1

    return {"broadcast": broadcast_count}
