"""
Case transfer API routes.

Endpoints:
    POST /transfers                    — Create a transfer request
    GET  /transfers                    — List transfers for facility
    GET  /transfers/{id}               — Get transfer detail
    PUT  /transfers/{id}/accept        — Accept transfer
    PUT  /transfers/{id}/reject        — Reject transfer
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

router = APIRouter()


class TransferCreateRequest(BaseModel):
    sos_request_id: UUID
    alert_id: Optional[UUID] = None
    to_facility_id: UUID
    to_department: str  # "hospital", "police", "civil_defense"
    reason: Optional[str] = None


class TransferRejectRequest(BaseModel):
    reason: Optional[str] = None


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


class TransferListResponse(BaseModel):
    transfers: list[TransferResponse]
    total: int


@router.post("/transfers", status_code=status.HTTP_201_CREATED)
async def create_transfer(
    payload: TransferCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_department_admin()),
):
    """Create a new case transfer request."""
    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not assigned to a facility",
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
    """Accept a transfer — routes the case to this facility."""
    transfer = await transfer_service.accept_transfer(
        db, transfer_id, accepted_by=current_user.id,
    )
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
    transfer = await transfer_service.reject_transfer(
        db, transfer_id,
        rejected_by=current_user.id,
        reason=payload.reason,
    )
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

    return transfer
