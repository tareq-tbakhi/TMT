"""
Case transfer service — handles transfers of SOS cases between departments/facilities.

Owns the additive schema pieces for the patient-transfer feature (patient
details, accepting facility, status timeline). Schema statements are
idempotent and run lazily on first use — mirroring the startup-migration
style in app.main (each in its own transaction, best-effort).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_transfer import CaseTransfer, TransferStatus
from app.models.sos_request import SosRequest
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)


class TransferStateError(Exception):
    """Raised when a status change is not allowed from the current state."""


# Terminal states — no further transitions allowed
_TERMINAL_STATUSES = (
    TransferStatus.REJECTED,
    TransferStatus.COMPLETED,
    TransferStatus.CANCELLED,
)

# Allowed transitions for the tracking flow
_ALLOWED_TRANSITIONS: dict[TransferStatus, tuple[TransferStatus, ...]] = {
    TransferStatus.IN_TRANSIT: (TransferStatus.ACCEPTED,),
    TransferStatus.COMPLETED: (TransferStatus.ACCEPTED, TransferStatus.IN_TRANSIT),
    TransferStatus.CANCELLED: (TransferStatus.PENDING, TransferStatus.ACCEPTED),
}

# ---------------------------------------------------------------------------
# Additive schema (lazy, idempotent)
# ---------------------------------------------------------------------------

_schema_ensured = False

_SCHEMA_STATEMENTS = [
    # New enum labels (SQLAlchemy persists enum member NAMES as labels)
    "ALTER TYPE transferstatus ADD VALUE IF NOT EXISTS 'IN_TRANSIT'",
    "ALTER TYPE transferstatus ADD VALUE IF NOT EXISTS 'COMPLETED'",
    "ALTER TYPE transferstatus ADD VALUE IF NOT EXISTS 'CANCELLED'",
    # Patient transfer details
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS patient_ref VARCHAR",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS urgency VARCHAR",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS medical_notes TEXT",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS accepted_facility_id UUID REFERENCES hospitals(id)",
    # Status timeline timestamps
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMP",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP",
    "ALTER TABLE case_transfers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP",
]


async def ensure_transfer_schema() -> None:
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
            logger.warning("Transfer schema statement failed (will retry): %s", stmt)
    if ok:
        _schema_ensured = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
        # Patient transfer details (additive)
        "patient_ref": t.patient_ref,
        "urgency": t.urgency,
        "medical_notes": t.medical_notes,
        "accepted_facility_id": str(t.accepted_facility_id) if t.accepted_facility_id else None,
        # Status timeline (additive)
        "accepted_at": t.accepted_at.isoformat() if t.accepted_at else None,
        "in_transit_at": t.in_transit_at.isoformat() if t.in_transit_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "cancelled_at": t.cancelled_at.isoformat() if t.cancelled_at else None,
    }


async def _attach_facility_names(db: AsyncSession, items: list[dict[str, Any]]) -> None:
    """Resolve facility names for from/to/accepted facilities (additive fields)."""
    ids: set[uuid.UUID] = set()
    for item in items:
        for key in ("from_facility_id", "to_facility_id", "accepted_facility_id"):
            value = item.get(key)
            if value:
                try:
                    ids.add(uuid.UUID(value))
                except ValueError:
                    pass
    if not ids:
        return
    result = await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(ids)))
    names = {str(row.id): row.name for row in result.all()}
    for item in items:
        item["from_facility_name"] = names.get(item.get("from_facility_id"))
        item["to_facility_name"] = names.get(item.get("to_facility_id"))
        if item.get("accepted_facility_id"):
            item["accepted_facility_name"] = names.get(item["accepted_facility_id"])


async def broadcast_transfer_update(transfer_data: dict[str, Any]) -> None:
    """Emit a transfer_updated event to dashboards and both facilities (best-effort)."""
    try:
        from app.api.websocket.handler import sio
        await sio.emit("transfer_updated", transfer_data, room="alerts")
        for key in ("from_facility_id", "to_facility_id"):
            fid = transfer_data.get(key)
            if fid:
                await sio.emit("transfer_updated", transfer_data, room=f"hospital_{fid}")
    except Exception:
        logger.exception("Failed to broadcast transfer update")


# ---------------------------------------------------------------------------
# CRUD / flow
# ---------------------------------------------------------------------------

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
    patient_ref: str | None = None,
    urgency: str | None = None,
    medical_notes: str | None = None,
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
        patient_ref=patient_ref,
        urgency=urgency,
        medical_notes=medical_notes,
    )
    db.add(transfer)
    await db.flush()
    await db.refresh(transfer)
    logger.info("Created transfer %s: %s -> %s", transfer.id, from_department, to_department)
    data = _transfer_to_dict(transfer)
    await _attach_facility_names(db, [data])
    return data


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
    items = [_transfer_to_dict(t) for t in result.scalars().all()]
    await _attach_facility_names(db, items)
    return items, total


async def get_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
) -> dict[str, Any] | None:
    """Get a single transfer by ID."""
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    t = result.scalar_one_or_none()
    if t is None:
        return None
    data = _transfer_to_dict(t)
    await _attach_facility_names(db, [data])
    return data


async def accept_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    accepted_by: uuid.UUID,
    accepted_facility_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    """Accept a transfer — assigns the accepting facility and updates SOS routing.

    Raises TransferStateError if the transfer is not pending.
    """
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        return None

    if transfer.status != TransferStatus.PENDING:
        raise TransferStateError(
            f"Transfer is already {transfer.status.value}; only pending transfers can be accepted"
        )

    now = datetime.utcnow()
    transfer.status = TransferStatus.ACCEPTED
    transfer.accepted_by = accepted_by
    transfer.accepted_facility_id = accepted_facility_id or transfer.to_facility_id
    transfer.accepted_at = now
    transfer.resolved_at = now  # kept for backward compatibility

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
    data = _transfer_to_dict(transfer)
    await _attach_facility_names(db, [data])
    return data


async def reject_transfer(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    rejected_by: uuid.UUID,
    reason: str | None = None,
) -> dict[str, Any] | None:
    """Reject a transfer request.

    Raises TransferStateError if the transfer is not pending.
    """
    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        return None

    if transfer.status != TransferStatus.PENDING:
        raise TransferStateError(
            f"Transfer is already {transfer.status.value}; only pending transfers can be rejected"
        )

    transfer.status = TransferStatus.REJECTED
    transfer.accepted_by = rejected_by  # track who rejected
    transfer.resolved_at = datetime.utcnow()
    if reason:
        transfer.reason = f"{transfer.reason or ''} | Rejected: {reason}"

    await db.flush()
    await db.refresh(transfer)
    logger.info("Transfer %s rejected by %s", transfer_id, rejected_by)
    data = _transfer_to_dict(transfer)
    await _attach_facility_names(db, [data])
    return data


async def update_transfer_status(
    db: AsyncSession,
    transfer_id: uuid.UUID,
    new_status: TransferStatus,
    *,
    actor_user_id: uuid.UUID,
    note: str | None = None,
) -> dict[str, Any] | None:
    """Move a transfer along the tracking flow:
    pending -> accepted -> in_transit -> completed, with cancelled as an
    exit from pending/accepted. Timestamps are recorded per step.

    Raises TransferStateError for disallowed transitions.
    """
    if new_status not in _ALLOWED_TRANSITIONS:
        raise TransferStateError(
            f"Status '{new_status.value}' cannot be set directly; "
            "use the accept/reject endpoints for those steps"
        )

    result = await db.execute(
        select(CaseTransfer).where(CaseTransfer.id == transfer_id)
    )
    transfer = result.scalar_one_or_none()
    if transfer is None:
        return None

    if transfer.status in _TERMINAL_STATUSES:
        raise TransferStateError(
            f"Transfer is already {transfer.status.value} and cannot be changed"
        )
    if transfer.status not in _ALLOWED_TRANSITIONS[new_status]:
        allowed = ", ".join(s.value for s in _ALLOWED_TRANSITIONS[new_status])
        raise TransferStateError(
            f"Cannot move a {transfer.status.value} transfer to {new_status.value} "
            f"(requires: {allowed})"
        )

    now = datetime.utcnow()
    transfer.status = new_status
    if new_status == TransferStatus.IN_TRANSIT:
        transfer.in_transit_at = now
    elif new_status == TransferStatus.COMPLETED:
        transfer.completed_at = now
        if transfer.resolved_at is None:
            transfer.resolved_at = now
    elif new_status == TransferStatus.CANCELLED:
        transfer.cancelled_at = now
        if transfer.resolved_at is None:
            transfer.resolved_at = now
        if note:
            transfer.reason = f"{transfer.reason or ''} | Cancelled: {note}"

    await db.flush()
    await db.refresh(transfer)
    logger.info("Transfer %s status -> %s (by %s)", transfer_id, new_status.value, actor_user_id)
    data = _transfer_to_dict(transfer)
    await _attach_facility_names(db, [data])
    return data
