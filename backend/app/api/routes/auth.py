"""
Unified authentication routes.

Endpoints:
    POST /auth/login                        — Authenticate any user by phone number (auto-detects role)
    POST /auth/logout                       — Revoke the presented access token (session invalidation)
    POST /auth/users/{user_id}/revoke-tokens — Force logout: revoke ALL tokens for a user (super admin)
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from app.api.middleware.rate_limit import rate_limit
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.user import User, UserRole, ROLE_TO_DEPARTMENT
from app.models.hospital import Hospital
from app.api.middleware.auth import (
    create_access_token,
    decode_token,
    get_current_user,
    get_revocation_store,
    require_role,
    security,
    verify_password_safe,
)
from app.api.middleware.audit import log_audit, mask_phone

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
    facility_type: Optional[str] = None  # "hospital", "police", "civil_defense"


class LogoutResponse(BaseModel):
    status: str = "success"
    detail: str


class RevokeTokensResponse(BaseModel):
    status: str = "success"
    user_id: str
    detail: str


@router.post("/auth/login", response_model=UnifiedLoginResponse,
              dependencies=[rate_limit(max_requests=10, window_seconds=60, key_prefix="auth")])
async def unified_login(
    payload: UnifiedLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate any user by phone number. Auto-detects role and returns JWT."""
    result = await db.execute(
        select(User).where(User.phone == payload.phone)
    )
    user = result.scalar_one_or_none()

    # Constant-work verification: a dummy hash is checked when the account
    # does not exist, so response timing does not leak account existence.
    if not verify_password_safe(payload.password, user.hashed_password if user else None):
        await log_audit(
            action="login_failed",
            resource="auth",
            user_id=user.id if user else None,
            details=f"Failed login attempt for phone {mask_phone(payload.phone)}",
            request=request,
            db=db,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone or password",
        )

    if not user.is_active:
        await log_audit(
            action="login_denied",
            resource="auth",
            user_id=user.id,
            details="Login attempt on deactivated account",
            request=request,
            db=db,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Resolve facility_type from the user's linked facility
    facility_type = None
    if user.hospital_id:
        fac_result = await db.execute(
            select(Hospital.department_type).where(Hospital.id == user.hospital_id)
        )
        dept = fac_result.scalar_one_or_none()
        if dept:
            facility_type = dept.value if hasattr(dept, "value") else str(dept)
        else:
            # Fallback: infer from role
            facility_type = ROLE_TO_DEPARTMENT.get(user.role)

    token_data = {
        "sub": str(user.id),
        "role": user.role.value,
    }
    if user.hospital_id:
        token_data["hospital_id"] = str(user.hospital_id)
    if user.patient_id:
        token_data["patient_id"] = str(user.patient_id)
    if facility_type:
        token_data["facility_type"] = facility_type

    token = create_access_token(data=token_data)

    await log_audit(
        action="login_success",
        resource="auth",
        user_id=user.id,
        details=f"User logged in (role={user.role.value})",
        request=request,
        db=db,
    )

    return UnifiedLoginResponse(
        access_token=token,
        role=user.role.value,
        user_id=str(user.id),
        hospital_id=str(user.hospital_id) if user.hospital_id else None,
        patient_id=str(user.patient_id) if user.patient_id else None,
        facility_type=facility_type,
    )


@router.post("/auth/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the presented access token (server-side session invalidation).

    The token's ``jti`` is added to the revocation list until its natural
    expiry; any later request with the same token is rejected with 401.
    """
    token_data = decode_token(credentials.credentials)
    if token_data.jti:
        await get_revocation_store().revoke_jti(token_data.jti, expires_at=token_data.exp)
        detail = "Token revoked"
    else:
        # Legacy token without a jti — the only reliable kill switch is a
        # full user-level revocation (also invalidates other sessions).
        await get_revocation_store().revoke_all_for_user(str(current_user.id))
        detail = "Legacy token: all sessions for this account were revoked"

    await log_audit(
        action="logout",
        resource="auth",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        details=detail,
        request=request,
        db=db,
    )
    return LogoutResponse(detail=detail)


@router.post("/auth/users/{user_id}/revoke-tokens", response_model=RevokeTokensResponse)
async def revoke_user_tokens(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Force logout a user everywhere (compromised-account response).

    Super admin only. Every token issued to the user before this call —
    including legacy tokens without ``jti``/``iat`` claims — becomes invalid.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await get_revocation_store().revoke_all_for_user(str(user_id))

    await log_audit(
        action="revoke_all_tokens",
        resource="user",
        resource_id=str(user_id),
        user_id=current_user.id,
        details=f"Super admin revoked all sessions for user {mask_phone(target.phone)}",
        request=request,
        db=db,
    )
    return RevokeTokensResponse(
        user_id=str(user_id),
        detail="All tokens issued before now are revoked for this user",
    )
