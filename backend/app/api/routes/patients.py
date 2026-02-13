"""
Patient API routes.

Endpoints:
    GET  /patients                      — List patients (hospital_admin)
    POST /patients                      — Register a new patient (public)
    POST /patients/login                — Patient login (returns JWT)
    GET  /patients/{id}                 — Get patient by ID
    PUT  /patients/{id}                 — Update patient profile
    GET  /patients/{id}/records         — Get patient medical records
    GET  /patients/{id}/sos             — Get patient SOS history
    GET  /patients/{id}/nearest-hospital — Find nearest hospital to patient
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient, MobilityStatus, LivingSituation, Gender
from app.api.middleware.auth import (
    get_current_user,
    require_role,
    hash_password,
    verify_password,
    create_access_token,
)
from app.api.middleware.audit import log_audit
from app.services import patient_service
from app.services import hospital_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PatientRegisterRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    national_id: Optional[str] = None
    primary_language: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    mobility: Optional[MobilityStatus] = MobilityStatus.CAN_WALK
    living_situation: Optional[LivingSituation] = LivingSituation.WITH_FAMILY
    blood_type: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    chronic_conditions: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    current_medications: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    insurance_info: Optional[str] = None
    emergency_contacts: Optional[list[dict]] = None
    consent_given: bool = False


class PatientLoginRequest(BaseModel):
    phone: str
    password: str


class PatientUpdateRequest(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    national_id: Optional[str] = None
    primary_language: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    mobility: Optional[MobilityStatus] = None
    living_situation: Optional[LivingSituation] = None
    blood_type: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    chronic_conditions: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    current_medications: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    insurance_info: Optional[str] = None
    notes: Optional[str] = None
    emergency_contacts: Optional[list[dict]] = None


class PatientResponse(BaseModel):
    id: UUID
    phone: str
    name: str
    # Demographics
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    national_id: Optional[str] = None
    primary_language: Optional[str] = None
    # Location
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    # Physical
    mobility: Optional[str] = None
    living_situation: Optional[str] = None
    blood_type: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    # Medical
    chronic_conditions: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    current_medications: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    insurance_info: Optional[str] = None
    notes: Optional[str] = None
    # Contacts
    emergency_contacts: Optional[list[dict]] = None
    # System
    false_alarm_count: Optional[int] = None
    total_sos_count: Optional[int] = None
    trust_score: Optional[float] = None
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
# Permission helper
# ---------------------------------------------------------------------------

def _check_patient_access(current_user: User, patient_id: UUID):
    """Raise 403 if user cannot access this patient record."""
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
    """List patients with optional search and mobility filter."""
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
    existing_user = await db.execute(select(User).where(User.phone == payload.phone))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this phone number already exists",
        )

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
    """Get patient details."""
    _check_patient_access(current_user, patient_id)

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
    """Update patient profile."""
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


# ---------------------------------------------------------------------------
# Medical records for a patient
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/records")
async def get_patient_records(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all medical records for a patient."""
    _check_patient_access(current_user, patient_id)

    records = await patient_service.get_medical_records(db, patient_id)
    return records


# ---------------------------------------------------------------------------
# SOS history for a patient
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/sos")
async def get_patient_sos(
    patient_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get SOS history for a patient."""
    _check_patient_access(current_user, patient_id)

    sos_list = await patient_service.list_patient_sos(db, patient_id, limit=limit)
    return sos_list


# ---------------------------------------------------------------------------
# Nearest hospital to a patient
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/nearest-hospital")
async def get_nearest_hospital(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find the nearest operational hospital to a patient's location."""
    _check_patient_access(current_user, patient_id)

    patient = await patient_service.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    if patient["latitude"] is None or patient["longitude"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient has no location set",
        )

    hospital = await hospital_service.find_nearest_operational_hospital(
        db, patient["latitude"], patient["longitude"]
    )

    if hospital is None:
        return {"message": "No nearby hospital found", "hospital": None}

    return {
        "hospital": {
            "id": hospital["id"],
            "name": hospital["name"],
            "distance_km": round(hospital.get("distance_m", 0) / 1000, 1),
            "status": hospital["status"],
            "available_beds": hospital["available_beds"],
            "phone": hospital.get("phone"),
            "latitude": hospital.get("latitude"),
            "longitude": hospital.get("longitude"),
        }
    }


# ---------------------------------------------------------------------------
# Live location update
# ---------------------------------------------------------------------------

class LocationUpdateRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


@router.post("/patients/{patient_id}/location")
async def update_patient_location(
    patient_id: UUID,
    payload: LocationUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a patient's live location.

    Lightweight endpoint designed for frequent calls from the mobile app.
    Triggers SOS auto-resolution if the patient reaches a hospital.
    """
    _check_patient_access(current_user, patient_id)

    updated = await patient_service.update_patient_location(
        db, patient_id, payload.latitude, payload.longitude
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    # Broadcast location update via WebSocket
    from app.api.websocket.handler import broadcast_patient_location
    try:
        await broadcast_patient_location({
            "patient_id": str(patient_id),
            "patient_name": updated.get("name"),
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "patient_info": {
                "name": updated.get("name"),
                "phone": updated.get("phone"),
                "blood_type": updated.get("blood_type"),
                "mobility": updated.get("mobility"),
                "gender": updated.get("gender"),
                "date_of_birth": str(updated.get("date_of_birth")) if updated.get("date_of_birth") else None,
                "chronic_conditions": updated.get("chronic_conditions", []),
                "allergies": updated.get("allergies", []),
                "current_medications": updated.get("current_medications", []),
                "special_equipment": updated.get("special_equipment", []),
                "emergency_contacts": updated.get("emergency_contacts", []),
                "trust_score": updated.get("trust_score", 1.0),
                "total_sos_count": updated.get("total_sos_count", 0),
                "false_alarm_count": updated.get("false_alarm_count", 0),
            },
        })
    except Exception:
        pass  # Non-critical

    # Check if this location triggers SOS auto-resolution
    from app.services import sos_resolution_service
    from app.api.websocket.handler import broadcast_sos_resolved
    try:
        resolutions = await sos_resolution_service.check_and_resolve(
            db, patient_id, payload.latitude, payload.longitude
        )
        for res in resolutions:
            await broadcast_sos_resolved(res)
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "SOS auto-resolution check failed for patient %s", patient_id, exc_info=True
        )

    return {"status": "ok", "latitude": payload.latitude, "longitude": payload.longitude}
