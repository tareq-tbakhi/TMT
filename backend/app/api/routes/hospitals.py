"""
Hospital API routes.

Endpoints:
    POST /hospitals              — Register a new hospital (admin)
    POST /hospitals/login        — Hospital staff login (returns JWT)
    GET  /hospitals               — List all hospitals with status (authenticated)
    GET  /hospitals/{id}          — Get single hospital detail
    PUT  /hospitals/{id}/status   — Update hospital status (hospital_admin)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.hospital import Hospital, HospitalStatus
from app.api.middleware.auth import (
    get_current_user,
    require_role,
    hash_password,
    verify_password,
    create_access_token,
)
from app.api.middleware.audit import log_audit
from app.services import hospital_service
from app.api.websocket.handler import broadcast_hospital_status

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class HospitalCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    bed_capacity: int = Field(default=0, ge=0)
    icu_beds: int = Field(default=0, ge=0)
    available_beds: int = Field(default=0, ge=0)
    specialties: Optional[list[str]] = None
    coverage_radius_km: float = Field(default=15.0, ge=0)
    phone: Optional[str] = None
    supply_levels: Optional[dict] = None
    # Admin user credentials for this hospital
    admin_phone: str = Field(..., min_length=6, max_length=20)
    admin_password: str = Field(..., min_length=8)
    admin_email: Optional[str] = None


class HospitalLoginRequest(BaseModel):
    phone: str
    password: str


class HospitalStatusUpdateRequest(BaseModel):
    status: HospitalStatus
    available_beds: Optional[int] = None
    icu_beds: Optional[int] = None
    supply_levels: Optional[dict] = None


class HospitalProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    coverage_radius_km: Optional[float] = None


class HospitalResponse(BaseModel):
    id: UUID
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: HospitalStatus
    bed_capacity: int
    icu_beds: int
    available_beds: int
    specialties: Optional[list[str]] = None
    coverage_radius_km: float
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    supply_levels: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HospitalListResponse(BaseModel):
    hospitals: list[HospitalResponse]
    total: int


class HospitalLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    hospital_id: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/hospitals", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED)
async def register_hospital(
    payload: HospitalCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Register a new hospital. Requires hospital_admin role."""
    # Check for duplicate admin phone
    existing = await db.execute(select(User).where(User.phone == payload.admin_phone))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this phone number already exists",
        )

    # Create Hospital record
    hospital = await hospital_service.create_hospital(
        db,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        bed_capacity=payload.bed_capacity,
        icu_beds=payload.icu_beds,
        available_beds=payload.available_beds,
        specialties=payload.specialties or [],
        coverage_radius_km=payload.coverage_radius_km,
        phone=payload.phone,
        supply_levels=payload.supply_levels or {},
    )
    await db.flush()

    # Create User record with HOSPITAL_ADMIN role
    admin_user = User(
        phone=payload.admin_phone,
        email=payload.admin_email,
        hashed_password=hash_password(payload.admin_password),
        role=UserRole.HOSPITAL_ADMIN,
        hospital_id=hospital.id,
    )
    db.add(admin_user)
    await db.flush()

    await log_audit(
        action="create",
        resource="hospital",
        resource_id=str(hospital.id),
        user_id=current_user.id,
        details=f"Hospital '{payload.name}' registered",
        request=request,
        db=db,
    )

    return hospital


@router.post("/hospitals/login", response_model=HospitalLoginResponse)
async def login_hospital(
    payload: HospitalLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate hospital staff and return a JWT token."""
    result = await db.execute(
        select(User).where(
            User.phone == payload.phone,
            User.role.in_([UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN]),
        )
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
            "hospital_id": str(user.hospital_id) if user.hospital_id else None,
        }
    )

    return HospitalLoginResponse(
        access_token=token,
        role=user.role.value,
        user_id=str(user.id),
        hospital_id=str(user.hospital_id) if user.hospital_id else "",
    )


@router.get("/hospitals", response_model=HospitalListResponse)
async def list_hospitals(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[HospitalStatus] = None,
    limit: int = 100,
    offset: int = 0,
):
    """List all hospitals with their current status. Requires authentication."""
    hospitals = await hospital_service.list_hospitals(
        db,
        status=status_filter,
        limit=limit,
        offset=offset,
    )

    await log_audit(
        action="read",
        resource="hospital",
        user_id=current_user.id,
        details=f"Listed hospitals (filter={status_filter}, limit={limit}, offset={offset})",
        request=request,
        db=db,
    )

    return HospitalListResponse(
        hospitals=[HospitalResponse.model_validate(h) for h in hospitals],
        total=len(hospitals),
    )


@router.get("/hospitals/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(
    hospital_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single hospital by ID."""
    hospital = await hospital_service.get_hospital(db, hospital_id)
    if hospital is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found",
        )

    await log_audit(
        action="read",
        resource="hospital",
        resource_id=str(hospital_id),
        user_id=current_user.id,
        details="Hospital record accessed",
        request=request,
        db=db,
    )

    return hospital


@router.put("/hospitals/{hospital_id}/status", response_model=HospitalResponse)
async def update_hospital_status(
    hospital_id: UUID,
    payload: HospitalStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Update hospital operational status. Requires hospital_admin role for that hospital."""
    # Hospital admins can only update their own hospital
    if current_user.hospital_id != hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update the status of your own hospital",
        )

    update_data = payload.model_dump(exclude_unset=True)
    hospital = await hospital_service.update_hospital(db, hospital_id, **update_data)
    if hospital is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found",
        )

    await log_audit(
        action="update",
        resource="hospital",
        resource_id=str(hospital_id),
        user_id=current_user.id,
        details=f"Hospital status updated to {payload.status.value}",
        request=request,
        db=db,
    )

    # Broadcast status change via WebSocket
    await broadcast_hospital_status({
        "hospital_id": str(hospital["id"]),
        "name": hospital["name"],
        "status": hospital["status"],
        "available_beds": hospital["available_beds"],
        "icu_beds": hospital["icu_beds"],
        "latitude": hospital.get("latitude"),
        "longitude": hospital.get("longitude"),
        "updated_at": hospital.get("updated_at"),
    })

    return hospital


@router.put("/hospitals/{hospital_id}/profile", response_model=HospitalResponse)
async def update_hospital_profile(
    hospital_id: UUID,
    payload: HospitalProfileUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """Update hospital profile information. Hospital admins can update their own hospital."""
    if current_user.role != UserRole.SUPER_ADMIN and current_user.hospital_id != hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own hospital's profile",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    hospital = await hospital_service.update_hospital(db, hospital_id, **update_data)
    if hospital is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found",
        )

    await log_audit(
        action="update",
        resource="hospital",
        resource_id=str(hospital_id),
        user_id=current_user.id,
        details=f"Hospital profile updated: {', '.join(update_data.keys())}",
        request=request,
        db=db,
    )

    return hospital
