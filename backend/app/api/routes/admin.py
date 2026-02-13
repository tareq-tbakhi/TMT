"""
Super Admin API routes.

Endpoints:
    GET    /admin/users         — List all users (paginated, searchable)
    POST   /admin/users         — Create a user (any role)
    PUT    /admin/users/{id}    — Update user (role, active status)
    DELETE /admin/users/{id}    — Deactivate a user
    GET    /admin/stats         — System-wide statistics
    PUT    /hospitals/{id}      — Full hospital update (super admin)
    DELETE /hospitals/{id}      — Delete a hospital (super admin)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.hospital import Hospital
from app.models.patient import Patient
from app.models.alert import Alert
from app.models.sos_request import SosRequest
from app.api.middleware.auth import get_current_user, require_role, hash_password
from app.api.middleware.audit import log_audit
from app.services import hospital_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    id: UUID
    phone: str
    email: Optional[str] = None
    role: str
    is_active: bool
    hospital_id: Optional[UUID] = None
    patient_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int


class UserCreateRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    role: str = "hospital_admin"
    hospital_id: Optional[UUID] = None


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    hospital_id: Optional[UUID] = None
    email: Optional[str] = None


class SystemStatsResponse(BaseModel):
    total_users: int
    total_patients: int
    total_hospitals: int
    total_alerts: int
    total_sos: int


class HospitalFullUpdateRequest(BaseModel):
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    bed_capacity: Optional[int] = None
    icu_beds: Optional[int] = None
    available_beds: Optional[int] = None
    specialties: Optional[list[str]] = None
    coverage_radius_km: Optional[float] = None
    phone: Optional[str] = None
    supply_levels: Optional[dict] = None


# ---------------------------------------------------------------------------
# User Management Endpoints (Super Admin)
# ---------------------------------------------------------------------------

@router.get("/admin/users", response_model=UserListResponse)
async def list_users(
    request: Request,
    role: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """List all users. Super admin only."""
    query = select(User).order_by(User.created_at.desc())

    if role:
        query = query.where(User.role == role)
    if search:
        query = query.where(
            (User.phone.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(
        users=[UserResponse(
            id=u.id,
            phone=u.phone,
            email=u.email,
            role=u.role.value if u.role else "unknown",
            is_active=u.is_active,
            hospital_id=u.hospital_id,
            patient_id=u.patient_id,
            created_at=u.created_at,
        ) for u in users],
        total=total,
    )


@router.post("/admin/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Create a new user. Super admin only."""
    existing = await db.execute(select(User).where(User.phone == payload.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already in use")

    user = User(
        phone=payload.phone,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
        hospital_id=payload.hospital_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await log_audit(
        action="create",
        resource="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        details=f"Created user {payload.phone} with role {payload.role}",
        request=request,
        db=db,
    )

    return UserResponse(
        id=user.id,
        phone=user.phone,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        hospital_id=user.hospital_id,
        patient_id=user.patient_id,
        created_at=user.created_at,
    )


@router.put("/admin/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Update a user. Super admin only."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.role is not None:
        user.role = UserRole(payload.role)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.hospital_id is not None:
        user.hospital_id = payload.hospital_id
    if payload.email is not None:
        user.email = payload.email

    user.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(user)

    await log_audit(
        action="update",
        resource="user",
        resource_id=str(user_id),
        user_id=current_user.id,
        details=f"Updated user: {payload.model_dump(exclude_unset=True)}",
        request=request,
        db=db,
    )

    return UserResponse(
        id=user.id,
        phone=user.phone,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        hospital_id=user.hospital_id,
        patient_id=user.patient_id,
        created_at=user.created_at,
    )


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Deactivate a user. Super admin only."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    user.updated_at = datetime.utcnow()
    await db.flush()

    await log_audit(
        action="delete",
        resource="user",
        resource_id=str(user_id),
        user_id=current_user.id,
        details=f"Deactivated user {user.phone}",
        request=request,
        db=db,
    )


# ---------------------------------------------------------------------------
# System Stats (Super Admin)
# ---------------------------------------------------------------------------

@router.get("/admin/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Get system-wide statistics. Super admin only."""
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_patients = (await db.execute(select(func.count(Patient.id)))).scalar_one()
    total_hospitals = (await db.execute(select(func.count(Hospital.id)))).scalar_one()
    total_alerts = (await db.execute(select(func.count(Alert.id)))).scalar_one()
    total_sos = (await db.execute(select(func.count(SosRequest.id)))).scalar_one()

    return SystemStatsResponse(
        total_users=total_users,
        total_patients=total_patients,
        total_hospitals=total_hospitals,
        total_alerts=total_alerts,
        total_sos=total_sos,
    )


# ---------------------------------------------------------------------------
# Hospital Full CRUD (Super Admin)
# ---------------------------------------------------------------------------

@router.put("/hospitals/{hospital_id}", response_model=dict)
async def full_update_hospital(
    hospital_id: UUID,
    payload: HospitalFullUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Full hospital update. Super admin only."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    hospital = await hospital_service.update_hospital(db, hospital_id, **update_data)
    if hospital is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

    await log_audit(
        action="update",
        resource="hospital",
        resource_id=str(hospital_id),
        user_id=current_user.id,
        details=f"Super admin updated hospital: {list(update_data.keys())}",
        request=request,
        db=db,
    )

    return hospital


@router.delete("/hospitals/{hospital_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hospital(
    hospital_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Delete a hospital. Super admin only."""
    result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = result.scalar_one_or_none()
    if hospital is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

    await db.delete(hospital)
    await db.flush()

    await log_audit(
        action="delete",
        resource="hospital",
        resource_id=str(hospital_id),
        user_id=current_user.id,
        details=f"Deleted hospital {hospital.name}",
        request=request,
        db=db,
    )
