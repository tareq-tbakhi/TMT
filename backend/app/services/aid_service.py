"""
Aid request service — CRUD for hospital aid requests and responses.

Also owns the additive schema pieces for the requests feature (expiry,
volunteer category, citizen-capable responses). Schema statements are
idempotent and run lazily on first use — mirroring the startup-migration
style in app.main (each in its own transaction, best-effort).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, or_, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.aid_request import (
    AidRequest, AidResponse, AidCategory, AidUrgency,
    AidRequestStatus, AidResponseStatus,
)
from app.models.hospital import Hospital
from app.api.websocket.handler import broadcast_aid_request

logger = logging.getLogger(__name__)

# Statuses that count as "active" (respondable / expirable)
_ACTIVE_STATUSES = (AidRequestStatus.OPEN, AidRequestStatus.RESPONDING)

# ---------------------------------------------------------------------------
# Additive schema (lazy, idempotent)
# ---------------------------------------------------------------------------

_schema_ensured = False

_SCHEMA_STATEMENTS = [
    # New enum labels (SQLAlchemy persists enum member NAMES as labels)
    "ALTER TYPE aidcategory ADD VALUE IF NOT EXISTS 'VOLUNTEER'",
    "ALTER TYPE aidrequeststatus ADD VALUE IF NOT EXISTS 'EXPIRED'",
    # Request expiry
    "ALTER TABLE aid_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP",
    # Responder attribution (citizen mobile support)
    "ALTER TABLE aid_responses ADD COLUMN IF NOT EXISTS responder_user_id UUID REFERENCES users(id)",
    "ALTER TABLE aid_responses ADD COLUMN IF NOT EXISTS responder_name VARCHAR",
    "ALTER TABLE aid_responses ADD COLUMN IF NOT EXISTS responder_phone VARCHAR",
    # Allow facility-less (citizen) responses
    "ALTER TABLE aid_responses ALTER COLUMN responding_hospital_id DROP NOT NULL",
]


async def ensure_aid_schema() -> None:
    """Apply additive schema changes once per process (idempotent)."""
    global _schema_ensured
    if _schema_ensured:
        return
    from app.db.postgres import engine

    ok = True
    for stmt in _SCHEMA_STATEMENTS:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            ok = False
            logger.warning("Aid schema statement failed (will retry): %s", stmt)
    if ok:
        _schema_ensured = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_dt(dt: datetime | None) -> datetime | None:
    """Normalize incoming datetimes to naive UTC (matches datetime.utcnow usage)."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _is_time_expired(req: AidRequest, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    return bool(req.expires_at and req.expires_at <= now and req.status in _ACTIVE_STATUSES)


def _aid_request_to_dict(req: AidRequest, include_responses: bool = False) -> dict[str, Any]:
    # Present expiry as a status even before it is persisted (computed on read)
    status_value = req.status.value if req.status else None
    is_expired = req.status == AidRequestStatus.EXPIRED
    if _is_time_expired(req):
        status_value = AidRequestStatus.EXPIRED.value
        is_expired = True

    data = {
        "id": str(req.id),
        "requesting_hospital_id": str(req.requesting_hospital_id),
        "category": req.category.value if req.category else None,
        "title": req.title,
        "description": req.description,
        "urgency": req.urgency.value if req.urgency else None,
        "quantity": req.quantity,
        "unit": req.unit,
        "status": status_value,
        "contact_phone": req.contact_phone,
        "contact_name": req.contact_name,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        "fulfilled_at": req.fulfilled_at.isoformat() if req.fulfilled_at else None,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        "is_expired": is_expired,
        "response_count": len(req.responses) if req.responses else 0,
    }
    if include_responses and req.responses:
        data["responses"] = [_aid_response_to_dict(r) for r in req.responses]
    return data


def _aid_response_to_dict(resp: AidResponse) -> dict[str, Any]:
    return {
        "id": str(resp.id),
        "aid_request_id": str(resp.aid_request_id),
        "responding_hospital_id": str(resp.responding_hospital_id) if resp.responding_hospital_id else None,
        "message": resp.message,
        "eta_hours": resp.eta_hours,
        "status": resp.status.value if resp.status else None,
        "created_at": resp.created_at.isoformat() if resp.created_at else None,
        "responder_user_id": str(resp.responder_user_id) if resp.responder_user_id else None,
        "responder_name": resp.responder_name,
        "responder_phone": resp.responder_phone,
    }


async def _persist_expiry(db: AsyncSession, requests: list[AidRequest]) -> None:
    """Flip time-expired active requests to EXPIRED (safe check on read, no cron)."""
    if not _schema_ensured:
        # Enum label may not exist yet — present computed status only.
        return
    now = datetime.utcnow()
    changed = False
    for req in requests:
        if _is_time_expired(req, now):
            req.status = AidRequestStatus.EXPIRED
            req.updated_at = now
            changed = True
    if changed:
        try:
            await db.flush()
        except Exception:
            logger.exception("Failed to persist aid request expiry")


def _status_criteria(status: str):
    """Expiry-aware status filter criteria."""
    st = AidRequestStatus(status)
    now = datetime.utcnow()
    if st == AidRequestStatus.EXPIRED:
        return or_(
            AidRequest.status == AidRequestStatus.EXPIRED,
            and_(
                AidRequest.status.in_(_ACTIVE_STATUSES),
                AidRequest.expires_at.isnot(None),
                AidRequest.expires_at <= now,
            ),
        )
    if st in _ACTIVE_STATUSES:
        return and_(
            AidRequest.status == st,
            or_(AidRequest.expires_at.is_(None), AidRequest.expires_at > now),
        )
    return AidRequest.status == st


async def _attach_hospital_name(db: AsyncSession, data: dict[str, Any], hospital_id: uuid.UUID) -> None:
    hosp = await db.execute(select(Hospital.name).where(Hospital.id == hospital_id))
    data["requesting_hospital_name"] = hosp.scalar_one_or_none() or "Unknown"


async def _broadcast_aid_update(payload: dict[str, Any]) -> None:
    """Emit an update event for dashboards (additive; separate from new_aid_request)."""
    try:
        from app.api.websocket.handler import sio
        await sio.emit("aid_request_updated", payload, room="alerts")
    except Exception:
        logger.exception("Failed to broadcast aid request update")


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_aid_request(
    db: AsyncSession,
    *,
    requesting_hospital_id: uuid.UUID,
    category: str | AidCategory,
    title: str,
    description: str | None = None,
    urgency: str | AidUrgency = AidUrgency.MEDIUM,
    quantity: str | None = None,
    unit: str | None = None,
    contact_phone: str | None = None,
    contact_name: str | None = None,
    expires_at: datetime | None = None,
) -> dict[str, Any]:
    if isinstance(category, str):
        category = AidCategory(category)
    if isinstance(urgency, str):
        urgency = AidUrgency(urgency)

    req = AidRequest(
        id=uuid.uuid4(),
        requesting_hospital_id=requesting_hospital_id,
        category=category,
        title=title,
        description=description,
        urgency=urgency,
        quantity=quantity,
        unit=unit,
        contact_phone=contact_phone,
        contact_name=contact_name,
        expires_at=_normalize_dt(expires_at),
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)

    payload = _aid_request_to_dict(req)

    # Add hospital name for broadcast
    hosp = await db.execute(select(Hospital.name).where(Hospital.id == requesting_hospital_id))
    hospital_name = hosp.scalar_one_or_none()
    payload["requesting_hospital_name"] = hospital_name

    try:
        await broadcast_aid_request(payload)
    except Exception:
        logger.exception("Failed to broadcast aid request %s", req.id)

    logger.info("Created aid request %s from hospital %s", req.id, requesting_hospital_id)
    return payload


async def list_aid_requests(
    db: AsyncSession,
    *,
    category: str | None = None,
    urgency: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = (
        select(AidRequest)
        .options(selectinload(AidRequest.responses))
        .order_by(AidRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if category:
        query = query.where(AidRequest.category == AidCategory(category))
    if urgency:
        query = query.where(AidRequest.urgency == AidUrgency(urgency))
    if status:
        query = query.where(_status_criteria(status))

    result = await db.execute(query)
    requests = list(result.scalars().unique().all())

    # Safe expiry check on read — persists computed expiry
    await _persist_expiry(db, requests)

    # Get hospital names
    hospital_ids = {r.requesting_hospital_id for r in requests}
    hospital_names = {}
    if hospital_ids:
        hosp_result = await db.execute(
            select(Hospital.id, Hospital.name).where(Hospital.id.in_(hospital_ids))
        )
        hospital_names = {row.id: row.name for row in hosp_result.all()}

    items = []
    for req in requests:
        data = _aid_request_to_dict(req)
        data["requesting_hospital_name"] = hospital_names.get(req.requesting_hospital_id, "Unknown")
        items.append(data)

    return items


async def get_aid_request_detail(
    db: AsyncSession,
    request_id: uuid.UUID,
) -> dict[str, Any] | None:
    result = await db.execute(
        select(AidRequest)
        .options(selectinload(AidRequest.responses))
        .where(AidRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        return None

    await _persist_expiry(db, [req])

    data = _aid_request_to_dict(req, include_responses=True)

    # Get requesting hospital name
    await _attach_hospital_name(db, data, req.requesting_hospital_id)

    # Get responding hospital names
    if data.get("responses"):
        resp_hospital_ids = {
            uuid.UUID(r["responding_hospital_id"])
            for r in data["responses"]
            if r.get("responding_hospital_id")
        }
        if resp_hospital_ids:
            hosp_result = await db.execute(
                select(Hospital.id, Hospital.name).where(Hospital.id.in_(resp_hospital_ids))
            )
            resp_names = {str(row.id): row.name for row in hosp_result.all()}
            for r in data["responses"]:
                if r.get("responding_hospital_id"):
                    r["responding_hospital_name"] = resp_names.get(r["responding_hospital_id"], "Unknown")

    return data


async def list_aid_responses(
    db: AsyncSession,
    request_id: uuid.UUID,
) -> list[dict[str, Any]] | None:
    """List all responses for a request (None if the request doesn't exist)."""
    exists = await db.execute(select(AidRequest.id).where(AidRequest.id == request_id))
    if exists.scalar_one_or_none() is None:
        return None

    result = await db.execute(
        select(AidResponse)
        .where(AidResponse.aid_request_id == request_id)
        .order_by(AidResponse.created_at.asc())
    )
    responses = list(result.scalars().all())
    items = [_aid_response_to_dict(r) for r in responses]

    hospital_ids = {r.responding_hospital_id for r in responses if r.responding_hospital_id}
    if hospital_ids:
        hosp_result = await db.execute(
            select(Hospital.id, Hospital.name).where(Hospital.id.in_(hospital_ids))
        )
        names = {str(row.id): row.name for row in hosp_result.all()}
        for item in items:
            if item.get("responding_hospital_id"):
                item["responding_hospital_name"] = names.get(item["responding_hospital_id"], "Unknown")

    return items


async def create_aid_response(
    db: AsyncSession,
    *,
    request_id: uuid.UUID,
    responding_hospital_id: uuid.UUID | None = None,
    message: str | None = None,
    eta_hours: float | None = None,
    responder_user_id: uuid.UUID | None = None,
    responder_name: str | None = None,
    responder_phone: str | None = None,
    require_active: bool = False,
) -> dict[str, Any] | None:
    """Create a response to an aid request.

    ``require_active`` rejects responses to fulfilled/cancelled/expired requests
    (used by the new POST endpoint; the legacy PUT keeps its permissive behavior).
    Raises ValueError("closed") when the request is not active.
    """
    # Check request exists
    result = await db.execute(select(AidRequest).where(AidRequest.id == request_id))
    req = result.scalar_one_or_none()
    if req is None:
        return None

    if require_active and (req.status not in _ACTIVE_STATUSES or _is_time_expired(req)):
        raise ValueError("closed")

    resp = AidResponse(
        id=uuid.uuid4(),
        aid_request_id=request_id,
        responding_hospital_id=responding_hospital_id,
        message=message,
        eta_hours=eta_hours,
        responder_user_id=responder_user_id,
        responder_name=responder_name,
        responder_phone=responder_phone,
    )
    db.add(resp)

    # Auto-update request status to responding
    if req.status == AidRequestStatus.OPEN and not _is_time_expired(req):
        req.status = AidRequestStatus.RESPONDING
        req.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(resp)

    data = _aid_response_to_dict(resp)
    if responding_hospital_id:
        hosp = await db.execute(select(Hospital.name).where(Hospital.id == responding_hospital_id))
        data["responding_hospital_name"] = hosp.scalar_one_or_none() or "Unknown"

    logger.info("Response %s added to aid request %s", resp.id, request_id)
    return data


async def update_aid_request_status(
    db: AsyncSession,
    request_id: uuid.UUID,
    new_status: str | AidRequestStatus,
) -> dict[str, Any] | None:
    if isinstance(new_status, str):
        new_status = AidRequestStatus(new_status)

    result = await db.execute(
        select(AidRequest)
        .options(selectinload(AidRequest.responses))
        .where(AidRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        return None

    req.status = new_status
    req.updated_at = datetime.utcnow()
    if new_status == AidRequestStatus.FULFILLED:
        req.fulfilled_at = datetime.utcnow()
    if new_status in _ACTIVE_STATUSES and _is_time_expired(req):
        # Manually reopening an expired request clears the stale expiry
        req.expires_at = None

    await db.flush()
    await db.refresh(req)

    logger.info("Aid request %s status -> %s", request_id, new_status.value)
    data = _aid_request_to_dict(req)
    await _attach_hospital_name(db, data, req.requesting_hospital_id)
    await _broadcast_aid_update(data)
    return data


# Fields that can be edited on an existing request
_EDITABLE_FIELDS = {
    "category", "title", "description", "urgency", "quantity", "unit",
    "contact_phone", "contact_name", "expires_at",
}


async def edit_aid_request(
    db: AsyncSession,
    request_id: uuid.UUID,
    fields: dict[str, Any],
) -> dict[str, Any] | None:
    """Edit an aid request. Only keys present in ``fields`` are updated.

    Raises ValueError for invalid category/urgency values.
    """
    result = await db.execute(
        select(AidRequest)
        .options(selectinload(AidRequest.responses))
        .where(AidRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        return None

    for key, value in fields.items():
        if key not in _EDITABLE_FIELDS:
            continue
        if key == "category" and value is not None:
            value = AidCategory(value)
        elif key == "urgency" and value is not None:
            value = AidUrgency(value)
        elif key == "expires_at":
            value = _normalize_dt(value)
        setattr(req, key, value)

    # A new future expiry reopens an expired request
    if (
        "expires_at" in fields
        and req.status == AidRequestStatus.EXPIRED
        and req.expires_at
        and req.expires_at > datetime.utcnow()
    ):
        req.status = (
            AidRequestStatus.RESPONDING if req.responses else AidRequestStatus.OPEN
        )

    req.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(req)

    logger.info("Aid request %s edited (%s)", request_id, ", ".join(sorted(fields.keys())))
    data = _aid_request_to_dict(req)
    await _attach_hospital_name(db, data, req.requesting_hospital_id)
    await _broadcast_aid_update(data)
    return data


async def extend_aid_request(
    db: AsyncSession,
    request_id: uuid.UUID,
    *,
    expires_at: datetime | None = None,
    extend_hours: float | None = None,
) -> dict[str, Any] | None:
    """Extend a request's expiry (or set one). Reopens the request if it expired."""
    result = await db.execute(
        select(AidRequest)
        .options(selectinload(AidRequest.responses))
        .where(AidRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if req is None:
        return None

    now = datetime.utcnow()
    if expires_at is not None:
        req.expires_at = _normalize_dt(expires_at)
    elif extend_hours is not None:
        base = req.expires_at if (req.expires_at and req.expires_at > now) else now
        req.expires_at = base + timedelta(hours=extend_hours)

    if (
        req.status == AidRequestStatus.EXPIRED
        and req.expires_at
        and req.expires_at > now
    ):
        req.status = (
            AidRequestStatus.RESPONDING if req.responses else AidRequestStatus.OPEN
        )

    req.updated_at = now
    await db.flush()
    await db.refresh(req)

    logger.info("Aid request %s extended to %s", request_id, req.expires_at)
    data = _aid_request_to_dict(req)
    await _attach_hospital_name(db, data, req.requesting_hospital_id)
    await _broadcast_aid_update(data)
    return data


async def count_aid_requests(
    db: AsyncSession,
    status: str | None = None,
    category: str | None = None,
    urgency: str | None = None,
) -> int:
    query = select(func.count(AidRequest.id))
    if status:
        query = query.where(_status_criteria(status))
    if category:
        query = query.where(AidRequest.category == AidCategory(category))
    if urgency:
        query = query.where(AidRequest.urgency == AidUrgency(urgency))
    result = await db.execute(query)
    return result.scalar_one()
