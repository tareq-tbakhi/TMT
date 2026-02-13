"""
Case transfer service — handles transfers of SOS cases between departments/facilities.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_transfer import CaseTransfer, TransferStatus
from app.models.sos_request import SosRequest
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)


def _transfer_to_dict(t: CaseTransfer) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "sos_request_id": str(t.sos_request_id),
        "alert_id": str(t.alert_id) if t.alert_id else None,
        "from_facility_id": str(t.from_facility_id),
        "to_facility_id": str(t.to_facility_id),
        "from_department": t.from_department,
        "to_department": t.to_department,
        "reason": t.reason,
        "status": t.status.value if t.status else None,
        "transferred_by": str(t.transferred_by),
        "accepted_by": str(t.accepted_by) if t.accepted_by else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
    }


async def create_transfer(
    db: AsyncSession,
    *,
    sos_request_id: uuid.UUID,
    alert_id: uuid.UUID | None = None,
    from_facility_id: uuid.UUID,
    to_facility_id: uuid.UUID,
    from_department: str,
    to_department: str,
    reason: str | None = None,
    transferred_by: uuid.UUID,
) -> dict[str, Any]:
    """Create a new case transfer request."""
    transfer = CaseTransfer(
        id=uuid.uuid4(),
        sos_request_id=sos_request_id,
        alert_id=alert_id,
        from_facility_id=from_facility_id,
        to_facility_id=to_facility_id,
        from_department=from_department,
        to_department=to_department,
        reason=reason,
        status=TransferStatus.PENDING,
        transferred_by=transferred_by,
    )
    db.add(transfer)
    await db.flush()
    await db.refresh(transfer)
    logger.info("Created transfer %s: %s -> %s", transfer.id, from_department, to_department)
    return _transfer_to_dict(transfer)


async def list_transfers(
    db: AsyncSession,
    *,
    facility_id: uuid.UUID | None = None,
    department: str | None = None,
    status_filter: TransferStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List transfers for a facility (incoming or outgoing)."""
    query = select(CaseTransfer).order_by(CaseTransfer.created_at.desc())

    if facility_id is not None:
        query = query.where(
            (CaseTransfer.from_facility_id == facility_id)
            | (CaseTransfer.to_facility_id == facility_id)
        )
    if department is not None:
        query = query.where(
            (CaseTransfer.from_department == department)
            | (CaseTransfer.to_department == department)
        )
    if status_filter is not None:
        query = query.where(CaseTransfer.status == status_filter)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return [_transfer_to_dict(t) for t in result.scalars().all()], total


async def get_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
) -> dict[str, Any] | None:
    """Get a single transfer by ID."""
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    t = result.scalar_one_or_none()
    return _transfer_to_dict(t) if t else None


async def accept_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    accepted_by: uuid.UUID,
) -> dict[str, Any] | None:
    """Accept a transfer — updates the SOS request routing."""
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        return None

    transfer.status = TransferStatus.ACCEPTED
    transfer.accepted_by = accepted_by
    transfer.resolved_at = datetime.utcnow()

    # Update the SOS request routing
    sos_result = await db.execute(
        select(SosRequest).where(SosRequest.id == transfer.sos_request_id)
    )
    sos = sos_result.scalar_one_or_none()
    if sos:
        sos.routed_department = transfer.to_department
        sos.facility_notified_id = transfer.to_facility_id

    await db.flush()
    await db.refresh(transfer)
    logger.info("Transfer %s accepted by %s", transfer_id, accepted_by)
    return _transfer_to_dict(transfer)


async def reject_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    rejected_by: uuid.UUID,
    reason: str | None = None,
) -> dict[str, Any] | None:
    """Reject a transfer request."""
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        return None

    transfer.status = TransferStatus.REJECTED
    transfer.accepted_by = rejected_by  # track who rejected
    transfer.resolved_at = datetime.utcnow()
    if reason:
        transfer.reason = f"{transfer.reason or ''} | Rejected: {reason}"

    await db.flush()
    await db.refresh(transfer)
    logger.info("Transfer %s rejected by %s", transfer_id, rejected_by)
    return _transfer_to_dict(transfer)
