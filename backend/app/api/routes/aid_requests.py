"""
Aid Request API routes.

Endpoints:
    POST /aid-requests                    — Create a new aid request (hospital_admin)
    GET  /aid-requests                    — List aid requests with filters (authenticated)
    GET  /aid-requests/{id}               — Get aid request detail with responses
    PUT  /aid-requests/{id}               — Edit an aid request (requester or super_admin)
    PUT  /aid-requests/{id}/extend        — Extend/set the request expiry (requester or super_admin)
    PUT  /aid-requests/{id}/respond       — Respond to an aid request (hospital_admin, legacy)
    POST /aid-requests/{id}/respond       — Respond to an aid request (any authenticated user —
                                            department admins today, citizen mobile later)
    GET  /aid-requests/{id}/responses     — List responses for a request (authenticated)
    PUT  /aid-requests/{id}/status        — Update aid request status (requester or super_admin)
"""

from datetime import datetime
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
    category: str = Field(..., description="blood, medication, equipment, personnel, supplies, volunteer, other")
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    urgency: str = Field(default="medium", description="low, medium, high, critical")
    quantity: Optional[str] = None
    unit: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_name: Optional[str] = None
    expires_at: Optional[datetime] = Field(default=None, description="Optional expiry — request auto-expires after this")


class AidRequestEditRequest(BaseModel):
    """Partial edit — only provided fields are updated."""
    category: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    urgency: Optional[str] = None
    quantity: Optional[str] = None
    unit: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_name: Optional[str] = None
    expires_at: Optional[datetime] = None


class AidRequestExtendRequest(BaseModel):
    expires_at: Optional[datetime] = Field(default=None, description="New absolute expiry")
    extend_hours: Optional[float] = Field(default=None, gt=0, le=24 * 30, description="Hours to extend from now/current expiry")


class AidResponseCreateRequest(BaseModel):
    message: Optional[str] = None
    eta_hours: Optional[float] = None
    # Responder attribution — used by citizen mobile clients later
    responder_name: Optional[str] = Field(default=None, max_length=200)
    responder_phone: Optional[str] = Field(default=None, max_length=30)


class AidRequestStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="open, responding, fulfilled, cancelled, expired")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_owned_request_or_403(
    db: AsyncSession, request_id: UUID, current_user: User
) -> dict:
    """Fetch a request and verify the current user's hospital owns it (or super_admin)."""
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
            detail="Only the requesting hospital or super admin can modify this request",
        )
    return detail


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
    await aid_service.ensure_aid_schema()

    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be associated with a hospital to create an aid request",
        )

    try:
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
            expires_at=payload.expires_at,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category or urgency: {exc}",
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
    await aid_service.ensure_aid_schema()

    try:
        requests_list = await aid_service.list_aid_requests(
            db,
            category=category,
            urgency=urgency,
            status=status_filter,
            limit=limit,
            offset=offset,
        )
        total = await aid_service.count_aid_requests(
            db, status=status_filter, category=category, urgency=urgency
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid filter value: {exc}",
        )
    return {"aid_requests": requests_list, "total": total}


@router.get("/aid-requests/{request_id}")
async def get_aid_request_detail(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single aid request with all responses."""
    await aid_service.ensure_aid_schema()

    result = await aid_service.get_aid_request_detail(db, request_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )
    return result


@router.put("/aid-requests/{request_id}")
async def edit_aid_request(
    request_id: UUID,
    payload: AidRequestEditRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Edit an aid request. Only the requester or super_admin can edit."""
    await aid_service.ensure_aid_schema()
    await _get_owned_request_or_403(db, request_id, current_user)

    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    try:
        result = await aid_service.edit_aid_request(db, request_id, fields)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid field value: {exc}",
        )
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
        details=f"Aid request edited: {', '.join(sorted(fields.keys()))}",
        request=request,
        db=db,
    )

    return result


@router.put("/aid-requests/{request_id}/extend")
async def extend_aid_request(
    request_id: UUID,
    payload: AidRequestExtendRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Extend (or set) a request's expiry. Reopens the request if it had expired."""
    await aid_service.ensure_aid_schema()

    if payload.expires_at is None and payload.extend_hours is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide expires_at or extend_hours",
        )

    await _get_owned_request_or_403(db, request_id, current_user)

    result = await aid_service.extend_aid_request(
        db,
        request_id,
        expires_at=payload.expires_at,
        extend_hours=payload.extend_hours,
    )
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
        details=f"Aid request extended to {result.get('expires_at')}",
        request=request,
        db=db,
    )

    return result


@router.get("/aid-requests/{request_id}/responses")
async def list_aid_request_responses(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all responses to an aid request (who responded, message, ETA)."""
    await aid_service.ensure_aid_schema()

    responses = await aid_service.list_aid_responses(db, request_id)
    if responses is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )
    return {"responses": responses, "total": len(responses)}


async def _create_response(
    request_id: UUID,
    payload: AidResponseCreateRequest,
    request: Request,
    db: AsyncSession,
    current_user: User,
    *,
    require_active: bool,
) -> dict:
    """Shared respond logic for the legacy PUT and the new POST endpoints."""
    try:
        result = await aid_service.create_aid_response(
            db,
            request_id=request_id,
            responding_hospital_id=current_user.hospital_id,
            message=payload.message,
            eta_hours=payload.eta_hours,
            responder_user_id=current_user.id,
            responder_name=payload.responder_name,
            responder_phone=payload.responder_phone,
            require_active=require_active,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This aid request is closed and no longer accepts responses",
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


@router.put("/aid-requests/{request_id}/respond")
async def respond_to_aid_request(
    request_id: UUID,
    payload: AidResponseCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Respond to an aid request from another hospital (legacy endpoint)."""
    await aid_service.ensure_aid_schema()

    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be associated with a hospital to respond",
        )

    return await _create_response(
        request_id, payload, request, db, current_user, require_active=False
    )


@router.post("/aid-requests/{request_id}/respond", status_code=status.HTTP_201_CREATED)
async def respond_to_aid_request_public(
    request_id: UUID,
    payload: AidResponseCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Respond to an active aid request.

    Open to any authenticated user: department admins respond on behalf of
    their facility; citizens (mobile, later) respond with their name/phone.
    """
    await aid_service.ensure_aid_schema()

    if not current_user.hospital_id and not payload.responder_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide responder_name when responding without a facility",
        )

    # A facility cannot respond to its own request
    detail = await aid_service.get_aid_request_detail(db, request_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aid request not found",
        )
    if (
        current_user.hospital_id
        and str(current_user.hospital_id) == detail["requesting_hospital_id"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot respond to your own aid request",
        )

    return await _create_response(
        request_id, payload, request, db, current_user, require_active=True
    )


@router.put("/aid-requests/{request_id}/status")
async def update_aid_request_status(
    request_id: UUID,
    payload: AidRequestStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Update aid request status. Only the requester or super_admin can update."""
    await aid_service.ensure_aid_schema()
    await _get_owned_request_or_403(db, request_id, current_user)

    try:
        result = await aid_service.update_aid_request_status(db, request_id, payload.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'",
        )
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
