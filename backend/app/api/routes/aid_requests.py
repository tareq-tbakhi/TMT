"""
Aid Request API routes.

Endpoints:
    POST /aid-requests             — Create a new aid request (hospital_admin)
    GET  /aid-requests             — List aid requests with filters (authenticated)
    GET  /aid-requests/{id}        — Get aid request detail with responses
    PUT  /aid-requests/{id}/respond — Respond to an aid request (hospital_admin)
    PUT  /aid-requests/{id}/status  — Update aid request status (requester or super_admin)
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.api.middleware.auth import get_current_user, require_role
from app.api.middleware.audit import log_audit
from app.services import aid_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AidRequestCreateRequest(BaseModel):
    category: str = Field(..., description="blood, medication, equipment, personnel, supplies, other")
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    urgency: str = Field(default="medium", description="low, medium, high, critical")
    quantity: Optional[str] = None
    unit: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_name: Optional[str] = None


class AidResponseCreateRequest(BaseModel):
    message: Optional[str] = None
    eta_hours: Optional[float] = None


class AidRequestStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="open, responding, fulfilled, cancelled")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/aid-requests", status_code=status.HTTP_201_CREATED)
async def create_aid_request(
    payload: AidRequestCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Create a new aid request. Requires hospital_admin role."""
    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be associated with a hospital to create an aid request",
        )

    result = await aid_service.create_aid_request(
        db,
        requesting_hospital_id=current_user.hospital_id,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        urgency=payload.urgency,
        quantity=payload.quantity,
        unit=payload.unit,
        contact_phone=payload.contact_phone,
        contact_name=payload.contact_name,
    )

    await log_audit(
        action="create",
        resource="aid_request",
        resource_id=result["id"],
        user_id=current_user.id,
        details=f"Aid request created: {payload.title}",
        request=request,
        db=db,
    )

    return result


@router.get("/aid-requests")
async def list_aid_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    category: Optional[str] = None,
    urgency: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """List aid requests with optional filters. Any authenticated user can view."""
    requests_list = await aid_service.list_aid_requests(
        db,
        category=category,
        urgency=urgency,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    total = await aid_service.count_aid_requests(db, status=status_filter)
    return {"aid_requests": requests_list, "total": total}


@router.get("/aid-requests/{request_id}")
async def get_aid_request_detail(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single aid request with all responses."""
    result = await aid_service.get_aid_request_detail(db, request_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )
    return result


@router.put("/aid-requests/{request_id}/respond")
async def respond_to_aid_request(
    request_id: UUID,
    payload: AidResponseCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Respond to an aid request from another hospital."""
    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be associated with a hospital to respond",
        )

    result = await aid_service.create_aid_response(
        db,
        request_id=request_id,
        responding_hospital_id=current_user.hospital_id,
        message=payload.message,
        eta_hours=payload.eta_hours,
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )

    await log_audit(
        action="create",
        resource="aid_response",
        resource_id=result["id"],
        user_id=current_user.id,
        details=f"Responded to aid request {request_id}",
        request=request,
        db=db,
    )

    return result


@router.put("/aid-requests/{request_id}/status")
async def update_aid_request_status(
    request_id: UUID,
    payload: AidRequestStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Update aid request status. Only the requester or super_admin can update."""
    # Check ownership
    detail = await aid_service.get_aid_request_detail(db, request_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )

    if (
        current_user.role != UserRole.SUPER_ADMIN
        and str(current_user.hospital_id) != detail["requesting_hospital_id"]
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requesting hospital or super admin can update status",
        )

    result = await aid_service.update_aid_request_status(db, request_id, payload.status)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )

    await log_audit(
        action="update",
        resource="aid_request",
        resource_id=str(request_id),
        user_id=current_user.id,
        details=f"Aid request status -> {payload.status}",
        request=request,
        db=db,
    )

    return result
