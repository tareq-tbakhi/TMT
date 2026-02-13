"""
Patient API routes.

Endpoints:
    GET  /patients         — List patients with optional search/filter (doctor / hospital_admin)
    POST /patients         — Register a new patient (public)
    POST /patients/login   — Patient login (returns JWT)
    GET  /patients/{id}    — Get patient by ID (patient self-access / hospital_admin / super_admin)
    PUT  /patients/{id}    — Update patient profile (patient self-update)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient, MobilityStatus, LivingSituation
from app.api.middleware.auth import (
    get_current_user,
    require_role,
    hash_password,
    verify_password,
    create_access_token,
)
from app.api.middleware.audit import log_audit
from app.services import patient_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PatientRegisterRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    mobility: Optional[MobilityStatus] = MobilityStatus.CAN_WALK
    living_situation: Optional[LivingSituation] = LivingSituation.WITH_FAMILY
    blood_type: Optional[str] = None
    emergency_contacts: Optional[list[dict]] = None
    consent_given: bool = False


class PatientLoginRequest(BaseModel):
    phone: str
    password: str


class PatientUpdateRequest(BaseModel):
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    mobility: Optional[MobilityStatus] = None
    living_situation: Optional[LivingSituation] = None
    blood_type: Optional[str] = None
    emergency_contacts: Optional[list[dict]] = None


class PatientResponse(BaseModel):
    id: UUID
    phone: str
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    mobility: Optional[MobilityStatus] = None
    living_situation: Optional[LivingSituation] = None
    blood_type: Optional[str] = None
    emergency_contacts: Optional[list[dict]] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    patient_id: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/patients", response_model=list[PatientResponse])
async def list_patients(
    request: Request,
    search: Optional[str] = Query(None, description="Search by name or phone"),
    mobility: Optional[MobilityStatus] = Query(None, description="Filter by mobility status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.HOSPITAL_ADMIN)),
):
    """List patients with optional search and mobility filter.

    Requires hospital_admin role.
    """
    patients = await patient_service.list_patients(
        db,
        search=search,
        mobility=mobility,
        limit=limit,
        offset=offset,
    )
    return patients


@router.post("/patients", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def register_patient(
    payload: PatientRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new patient. Public endpoint — no auth required."""
    # Check for duplicate phone
    existing_user = await db.execute(select(User).where(User.phone == payload.phone))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this phone number already exists",
        )

    # Create Patient record
    patient = await patient_service.create_patient(
        db,
        phone=payload.phone,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        mobility=payload.mobility,
        living_situation=payload.living_situation,
        blood_type=payload.blood_type,
        emergency_contacts=payload.emergency_contacts or [],
        consent_given=payload.consent_given,
    )
    await db.flush()

    # Create User record with hashed password
    user = User(
        phone=payload.phone,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.PATIENT,
        patient_id=patient["id"],
    )
    db.add(user)
    await db.flush()

    await log_audit(
        action="create",
        resource="patient",
        resource_id=str(patient["id"]),
        user_id=user.id,
        details="Patient registered",
        request=request,
        db=db,
    )

    return patient


@router.post("/patients/login", response_model=LoginResponse)
async def login_patient(
    payload: PatientLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a patient and return a JWT token."""
    result = await db.execute(
        select(User).where(User.phone == payload.phone, User.role == UserRole.PATIENT)
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
            "patient_id": str(user.patient_id) if user.patient_id else None,
        }
    )

    return LoginResponse(
        access_token=token,
        role=user.role.value,
        user_id=str(user.id),
        patient_id=str(user.patient_id) if user.patient_id else "",
    )


@router.get("/patients/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get patient details.

    Patients can access their own record. Hospital admins and super admins
    can access any patient record.
    """
    # Permission check: patients can only access their own record
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access your own patient record",
            )
    elif current_user.role not in (UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    patient = await patient_service.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    await log_audit(
        action="read",
        resource="patient",
        resource_id=str(patient_id),
        user_id=current_user.id,
        details="Patient record accessed",
        request=request,
        db=db,
    )

    return patient


@router.put("/patients/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: UUID,
    payload: PatientUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update patient profile. Patient can update their own profile."""
    # Patients can only update their own profile
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own profile",
            )
    elif current_user.role not in (UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    patient = await patient_service.update_patient(db, patient_id, **update_data)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    await log_audit(
        action="update",
        resource="patient",
        resource_id=str(patient_id),
        user_id=current_user.id,
        details=f"Patient profile updated: {list(update_data.keys())}",
        request=request,
        db=db,
    )

    return patient
