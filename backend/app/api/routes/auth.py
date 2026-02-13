"""
Unified authentication route.

Endpoints:
    POST /auth/login  — Authenticate any user by phone number (auto-detects role)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User
from app.api.middleware.auth import verify_password, create_access_token

router = APIRouter()


class UnifiedLoginRequest(BaseModel):
    phone: str
    password: str


class UnifiedLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    hospital_id: Optional[str] = None
    patient_id: Optional[str] = None


@router.post("/auth/login", response_model=UnifiedLoginResponse)
async def unified_login(
    payload: UnifiedLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate any user by phone number. Auto-detects role and returns JWT."""
    result = await db.execute(
        select(User).where(User.phone == payload.phone)
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

    token_data = {
        "sub": str(user.id),
        "role": user.role.value,
    }
    if user.hospital_id:
        token_data["hospital_id"] = str(user.hospital_id)
    if user.patient_id:
        token_data["patient_id"] = str(user.patient_id)

    token = create_access_token(data=token_data)

    return UnifiedLoginResponse(
        access_token=token,
        role=user.role.value,
        user_id=str(user.id),
        hospital_id=str(user.hospital_id) if user.hospital_id else None,
        patient_id=str(user.patient_id) if user.patient_id else None,
    )
