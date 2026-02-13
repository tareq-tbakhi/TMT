"""
Medical Records API routes.

Endpoints:
    GET  /patients/{id}/records  — Get medical records for a patient (doctor)
    POST /patients/{id}/records  — Create a medical record (doctor)
    PUT  /records/{id}           — Update a medical record (doctor)
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole
from app.models.medical_record import MedicalRecord
from app.api.middleware.auth import get_current_user, require_role
from app.api.middleware.audit import log_audit
from app.services import patient_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MedicalRecordCreateRequest(BaseModel):
    conditions: Optional[list[str]] = None
    medications: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    notes: Optional[str] = None


class MedicalRecordUpdateRequest(BaseModel):
    conditions: Optional[list[str]] = None
    medications: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    notes: Optional[str] = None


class MedicalRecordResponse(BaseModel):
    id: UUID
    patient_id: UUID
    conditions: Optional[list[str]] = None
    medications: Optional[list[str]] = None
    allergies: Optional[list[str]] = None
    special_equipment: Optional[list[str]] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MedicalRecordListResponse(BaseModel):
    records: list[MedicalRecordResponse]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/records", response_model=MedicalRecordListResponse)
async def get_patient_records(
    patient_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get medical records for a patient. Patients can view their own records."""
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only view your own records")
    elif current_user.role not in (UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    # Verify patient exists
    patient = await patient_service.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    records = await patient_service.get_medical_records(db, patient_id)

    await log_audit(
        action="read",
        resource="medical_record",
        resource_id=str(patient_id),
        user_id=current_user.id,
        details=f"Accessed {len(records)} medical records for patient",
        request=request,
        db=db,
    )

    return MedicalRecordListResponse(
        records=[MedicalRecordResponse.model_validate(r) for r in records],
        total=len(records),
    )


@router.post(
    "/patients/{patient_id}/records",
    response_model=MedicalRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_medical_record(
    patient_id: UUID,
    payload: MedicalRecordCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new medical record. Patients can create their own records."""
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only add your own records")
    elif current_user.role not in (UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    # Verify patient exists
    patient = await patient_service.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    record = await patient_service.create_medical_record(
        db,
        patient_id=patient_id,
        conditions=payload.conditions or [],
        medications=payload.medications or [],
        allergies=payload.allergies or [],
        special_equipment=payload.special_equipment or [],
        notes=payload.notes,
    )

    await log_audit(
        action="create",
        resource="medical_record",
        resource_id=str(record.id),
        user_id=current_user.id,
        details=f"Medical record created for patient {patient_id}",
        request=request,
        db=db,
    )

    return record


@router.put("/records/{record_id}", response_model=MedicalRecordResponse)
async def update_medical_record(
    record_id: UUID,
    payload: MedicalRecordUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a medical record. Patients can update their own records."""
    if current_user.role == UserRole.PATIENT:
        from sqlalchemy import select as sa_select
        rec = await db.execute(sa_select(MedicalRecord).where(MedicalRecord.id == record_id))
        record_obj = rec.scalar_one_or_none()
        if record_obj is None or record_obj.patient_id != current_user.patient_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only update your own records")
    elif current_user.role not in (UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    record = await patient_service.update_medical_record(db, record_id, update_data)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medical record not found",
        )

    await log_audit(
        action="update",
        resource="medical_record",
        resource_id=str(record_id),
        user_id=current_user.id,
        details=f"Medical record updated: {list(update_data.keys())}",
        request=request,
        db=db,
    )

    return record
