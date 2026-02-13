"""
Aid request service — CRUD for hospital aid requests and responses.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.aid_request import (
    AidRequest, AidResponse, AidCategory, AidUrgency,
    AidRequestStatus, AidResponseStatus,
)
from app.models.hospital import Hospital
from app.api.websocket.handler import broadcast_aid_request

logger = logging.getLogger(__name__)


def _aid_request_to_dict(req: AidRequest, include_responses: bool = False) -> dict[str, Any]:
    data = {
        "id": str(req.id),
        "requesting_hospital_id": str(req.requesting_hospital_id),
        "category": req.category.value if req.category else None,
        "title": req.title,
        "description": req.description,
        "urgency": req.urgency.value if req.urgency else None,
        "quantity": req.quantity,
        "unit": req.unit,
        "status": req.status.value if req.status else None,
        "contact_phone": req.contact_phone,
        "contact_name": req.contact_name,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        "fulfilled_at": req.fulfilled_at.isoformat() if req.fulfilled_at else None,
        "response_count": len(req.responses) if req.responses else 0,
    }
    if include_responses and req.responses:
        data["responses"] = [_aid_response_to_dict(r) for r in req.responses]
    return data


def _aid_response_to_dict(resp: AidResponse) -> dict[str, Any]:
    return {
        "id": str(resp.id),
        "aid_request_id": str(resp.aid_request_id),
        "responding_hospital_id": str(resp.responding_hospital_id),
        "message": resp.message,
        "eta_hours": resp.eta_hours,
        "status": resp.status.value if resp.status else None,
        "created_at": resp.created_at.isoformat() if resp.created_at else None,
    }


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
        query = query.where(AidRequest.status == AidRequestStatus(status))

    result = await db.execute(query)
    requests = result.scalars().unique().all()

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

    data = _aid_request_to_dict(req, include_responses=True)

    # Get requesting hospital name
    hosp = await db.execute(select(Hospital.name).where(Hospital.id == req.requesting_hospital_id))
    data["requesting_hospital_name"] = hosp.scalar_one_or_none() or "Unknown"

    # Get responding hospital names
    if data.get("responses"):
        resp_hospital_ids = {uuid.UUID(r["responding_hospital_id"]) for r in data["responses"]}
        if resp_hospital_ids:
            hosp_result = await db.execute(
                select(Hospital.id, Hospital.name).where(Hospital.id.in_(resp_hospital_ids))
            )
            resp_names = {str(row.id): row.name for row in hosp_result.all()}
            for r in data["responses"]:
                r["responding_hospital_name"] = resp_names.get(r["responding_hospital_id"], "Unknown")

    return data


async def create_aid_response(
    db: AsyncSession,
    *,
    request_id: uuid.UUID,
    responding_hospital_id: uuid.UUID,
    message: str | None = None,
    eta_hours: float | None = None,
) -> dict[str, Any] | None:
    # Check request exists
    result = await db.execute(select(AidRequest).where(AidRequest.id == request_id))
    req = result.scalar_one_or_none()
    if req is None:
        return None

    resp = AidResponse(
        id=uuid.uuid4(),
        aid_request_id=request_id,
        responding_hospital_id=responding_hospital_id,
        message=message,
        eta_hours=eta_hours,
    )
    db.add(resp)

    # Auto-update request status to responding
    if req.status == AidRequestStatus.OPEN:
        req.status = AidRequestStatus.RESPONDING
        req.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(resp)

    logger.info("Hospital %s responded to aid request %s", responding_hospital_id, request_id)
    return _aid_response_to_dict(resp)


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

    await db.flush()
    await db.refresh(req)

    logger.info("Aid request %s status -> %s", request_id, new_status.value)
    return _aid_request_to_dict(req)


async def count_aid_requests(db: AsyncSession, status: str | None = None) -> int:
    query = select(func.count(AidRequest.id))
    if status:
        query = query.where(AidRequest.status == AidRequestStatus(status))
    result = await db.execute(query)
    return result.scalar_one()
