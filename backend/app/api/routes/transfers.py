"""
Case transfer API routes.

Endpoints:
    POST /transfers                    — Create a transfer request
    GET  /transfers                    — List transfers for facility
    GET  /transfers/{id}               — Get transfer detail
    PUT  /transfers/{id}/accept        — Accept transfer (target facility)
    PUT  /transfers/{id}/reject        — Reject transfer (target facility)
    PUT  /transfers/{id}/status        — Track flow: in_transit / completed / cancelled
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.case_transfer import TransferStatus
from app.api.middleware.auth import get_current_user, require_any_department_admin
from app.api.middleware.audit import log_audit
from app.services import transfer_service
from app.services.transfer_service import TransferStateError

router = APIRouter()

_URGENCY_VALUES = {"low", "medium", "high", "critical"}


class TransferCreateRequest(BaseModel):
    sos_request_id: UUID
    alert_id: Optional[UUID] = None
    to_facility_id: UUID
    to_department: str  # "hospital", "police", "civil_defense"
    reason: Optional[str] = None
    # Patient transfer details (all optional, additive)
    patient_ref: Optional[str] = None
    urgency: Optional[str] = None  # low | medium | high | critical
    medical_notes: Optional[str] = None


class TransferRejectRequest(BaseModel):
    reason: Optional[str] = None


class TransferStatusUpdateRequest(BaseModel):
    status: str  # "in_transit" | "completed" | "cancelled"
    note: Optional[str] = None  # optional note (recorded for cancellations)


class TransferResponse(BaseModel):
    id: UUID
    sos_request_id: UUID
    alert_id: Optional[UUID] = None
    from_facility_id: UUID
    to_facility_id: UUID
    from_department: str
    to_department: str
    reason: Optional[str] = None
    status: str
    transferred_by: UUID
    accepted_by: Optional[UUID] = None
    created_at: Optional[str] = None
    resolved_at: Optional[str] = None
    # Additive fields
    patient_ref: Optional[str] = None
    urgency: Optional[str] = None
    medical_notes: Optional[str] = None
    accepted_facility_id: Optional[UUID] = None
    accepted_at: Optional[str] = None
    in_transit_at: Optional[str] = None
    completed_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    from_facility_name: Optional[str] = None
    to_facility_name: Optional[str] = None
    accepted_facility_name: Optional[str] = None


class TransferListResponse(BaseModel):
    transfers: list[TransferResponse]
    total: int


def _is_super(user: User) -> bool:
    return user.role == UserRole.SUPER_ADMIN


def _user_facility(user: User) -> Optional[str]:
    return str(user.hospital_id) if user.hospital_id else None


async def _broadcast_update(transfer: dict) -> None:
    try:
        await transfer_service.broadcast_transfer_update(transfer)
    except Exception:
        pass


@router.post("/transfers", status_code=status.HTTP_201_CREATED)
async def create_transfer(
    payload: TransferCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Create a new case transfer request."""
    await transfer_service.ensure_transfer_schema()

    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not assigned to a facility",
        )

    if payload.urgency and payload.urgency not in _URGENCY_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid urgency '{payload.urgency}'. Allowed: {sorted(_URGENCY_VALUES)}",
        )

    if payload.to_facility_id == current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer a case to your own facility",
        )

    from_department = current_user.department_type or "hospital"

    transfer = await transfer_service.create_transfer(
        db,
        sos_request_id=payload.sos_request_id,
        alert_id=payload.alert_id,
        from_facility_id=current_user.hospital_id,
        to_facility_id=payload.to_facility_id,
        from_department=from_department,
        to_department=payload.to_department,
        reason=payload.reason,
        transferred_by=current_user.id,
        patient_ref=payload.patient_ref,
        urgency=payload.urgency,
        medical_notes=payload.medical_notes,
    )

    await log_audit(
        action="create",
        resource="case_transfer",
        resource_id=transfer["id"],
        user_id=current_user.id,
        details=f"Transfer created: {from_department} -> {payload.to_department}",
        request=request,
        db=db,
    )

    # Broadcast transfer notification
    try:
        from app.api.websocket.handler import broadcast_transfer
        await broadcast_transfer(transfer)
    except Exception:
        pass

    return transfer


@router.get("/transfers")
async def list_transfers(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List transfers for current facility."""
    await transfer_service.ensure_transfer_schema()

    facility_id = current_user.hospital_id if current_user.role != UserRole.SUPER_ADMIN else None

    ts = None
    if status_filter:
        try:
            ts = TransferStatus(status_filter)
        except ValueError:
            pass

    transfers, total = await transfer_service.list_transfers(
        db,
        facility_id=facility_id,
        status_filter=ts,
        limit=limit,
        offset=offset,
    )

    return {"transfers": transfers, "total": total}


@router.get("/transfers/{transfer_id}")
async def get_transfer(
    transfer_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Get a single transfer by ID."""
    await transfer_service.ensure_transfer_schema()

    transfer = await transfer_service.get_transfer(db, transfer_id)
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return transfer


@router.put("/transfers/{transfer_id}/accept")
async def accept_transfer(
    transfer_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Accept a transfer — assigns this facility as the accepting unit."""
    await transfer_service.ensure_transfer_schema()

    existing = await transfer_service.get_transfer(db, transfer_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    # Only the target facility (or super admin) can accept
    if not _is_super(current_user) and _user_facility(current_user) != existing["to_facility_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the target facility can accept this transfer",
        )

    try:
        transfer = await transfer_service.accept_transfer(
            db,
            transfer_id,
            accepted_by=current_user.id,
            accepted_facility_id=current_user.hospital_id,
        )
    except TransferStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    await log_audit(
        action="update",
        resource="case_transfer",
        resource_id=str(transfer_id),
        user_id=current_user.id,
        details="Transfer accepted",
        request=request,
        db=db,
    )

    await _broadcast_update(transfer)

    return transfer


@router.put("/transfers/{transfer_id}/reject")
async def reject_transfer(
    transfer_id: UUID,
    payload: TransferRejectRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Reject a transfer request."""
    await transfer_service.ensure_transfer_schema()

    existing = await transfer_service.get_transfer(db, transfer_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    # Only the target facility (or super admin) can reject
    if not _is_super(current_user) and _user_facility(current_user) != existing["to_facility_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the target facility can reject this transfer",
        )

    try:
        transfer = await transfer_service.reject_transfer(
            db, transfer_id,
            rejected_by=current_user.id,
            reason=payload.reason,
        )
    except TransferStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    await log_audit(
        action="update",
        resource="case_transfer",
        resource_id=str(transfer_id),
        user_id=current_user.id,
        details=f"Transfer rejected: {payload.reason}",
        request=request,
        db=db,
    )

    await _broadcast_update(transfer)

    return transfer


@router.put("/transfers/{transfer_id}/status")
async def update_transfer_status(
    transfer_id: UUID,
    payload: TransferStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Move an accepted transfer along the tracking flow.

    Transitions:
        accepted   -> in_transit   (accepting facility)
        in_transit -> completed    (either facility)
        pending/accepted -> cancelled (requesting facility)
    """
    await transfer_service.ensure_transfer_schema()

    try:
        new_status = TransferStatus(payload.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'",
        )

    existing = await transfer_service.get_transfer(db, transfer_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    # Per-transition permissions
    facility = _user_facility(current_user)
    if not _is_super(current_user):
        if new_status == TransferStatus.IN_TRANSIT and facility != existing["to_facility_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the accepting facility can start transit",
            )
        if new_status == TransferStatus.COMPLETED and facility not in (
            existing["to_facility_id"], existing["from_facility_id"]
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the involved facilities can complete this transfer",
            )
        if new_status == TransferStatus.CANCELLED and facility != existing["from_facility_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the requesting facility can cancel this transfer",
            )

    try:
        transfer = await transfer_service.update_transfer_status(
            db,
            transfer_id,
            new_status,
            actor_user_id=current_user.id,
            note=payload.note,
        )
    except TransferStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")

    await log_audit(
        action="update",
        resource="case_transfer",
        resource_id=str(transfer_id),
        user_id=current_user.id,
        details=f"Transfer status -> {payload.status}",
        request=request,
        db=db,
    )

    await _broadcast_update(transfer)

    return transfer
