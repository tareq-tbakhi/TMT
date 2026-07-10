import abc
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.postgres import get_db
from app.models.user import User, UserRole, DEPARTMENT_ADMIN_ROLES

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Pre-computed hash used to equalize response timing when a login is
# attempted for a non-existent account (prevents user enumeration via
# timing side channel). See ``verify_password_safe``.
_DUMMY_PASSWORD_HASH = pwd_context.hash(uuid.uuid4().hex)


class TokenData(BaseModel):
    user_id: str
    role: UserRole
    hospital_id: Optional[str] = None
    patient_id: Optional[str] = None
    facility_type: Optional[str] = None  # "hospital", "police", "civil_defense"
    jti: Optional[str] = None            # unique token id (revocation)
    iat: Optional[int] = None            # issued-at (epoch seconds)
    exp: Optional[int] = None            # expiry (epoch seconds)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    hospital_id: Optional[str] = None
    facility_type: Optional[str] = None


# ---------------------------------------------------------------------------
# Token revocation (feature 11.2.5 — session invalidation / force logout)
# ---------------------------------------------------------------------------

class TokenRevocationStore(abc.ABC):
    """Revocation-list interface.

    The default in-memory implementation is single-process; swap in a
    Redis-backed implementation via ``set_revocation_store()`` for
    multi-worker deployments.
    """

    @abc.abstractmethod
    async def revoke_jti(self, jti: str, expires_at: Optional[int] = None) -> None:
        """Revoke a single token by its ``jti`` until it naturally expires."""

    @abc.abstractmethod
    async def is_jti_revoked(self, jti: str) -> bool:
        """Return True when the token id has been revoked."""

    @abc.abstractmethod
    async def revoke_all_for_user(self, user_id: str) -> None:
        """Invalidate every token issued to *user_id* up to now."""

    @abc.abstractmethod
    async def user_revocation_cutoff(self, user_id: str) -> Optional[float]:
        """Epoch seconds; tokens issued before this instant are invalid."""


class InMemoryTokenRevocationStore(TokenRevocationStore):
    """Process-local revocation list with lazy expiry pruning."""

    def __init__(self):
        self._revoked_jtis: dict[str, float] = {}   # jti -> expiry epoch
        self._user_cutoffs: dict[str, float] = {}   # user_id -> cutoff epoch

    async def revoke_jti(self, jti: str, expires_at: Optional[int] = None) -> None:
        default_ttl = settings.JWT_EXPIRATION_MINUTES * 60
        self._revoked_jtis[jti] = float(expires_at) if expires_at else time.time() + default_ttl
        self._prune()

    async def is_jti_revoked(self, jti: str) -> bool:
        expiry = self._revoked_jtis.get(jti)
        if expiry is None:
            return False
        if expiry < time.time():
            self._revoked_jtis.pop(jti, None)
            return False
        return True

    async def revoke_all_for_user(self, user_id: str) -> None:
        self._user_cutoffs[str(user_id)] = time.time()

    async def user_revocation_cutoff(self, user_id: str) -> Optional[float]:
        return self._user_cutoffs.get(str(user_id))

    def _prune(self) -> None:
        now = time.time()
        stale = [j for j, exp in self._revoked_jtis.items() if exp < now]
        for j in stale:
            self._revoked_jtis.pop(j, None)


_revocation_store: Optional[TokenRevocationStore] = None


def get_revocation_store() -> TokenRevocationStore:
    """Return the process-wide revocation store (lazily created)."""
    global _revocation_store
    if _revocation_store is None:
        _revocation_store = InMemoryTokenRevocationStore()
    return _revocation_store


def set_revocation_store(store: TokenRevocationStore) -> None:
    """Swap the revocation backend (tests / Redis)."""
    global _revocation_store
    _revocation_store = store


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def verify_password_safe(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Constant-work password check.

    When *hashed_password* is ``None`` (account does not exist) a dummy hash
    is verified instead so the response time does not reveal whether the
    account exists. Always returns ``False`` in that case.
    """
    if hashed_password is None:
        pwd_context.verify(plain_password, _DUMMY_PASSWORD_HASH)
        return False
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed access token.

    Every token carries ``jti`` (unique id) and ``iat`` (issued-at) claims so
    individual tokens — or all tokens for a user — can be revoked server-side.
    """
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.JWT_EXPIRATION_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": uuid.uuid4().hex,
    })
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return TokenData(
            user_id=payload["sub"],
            role=payload["role"],
            hospital_id=payload.get("hospital_id"),
            patient_id=payload.get("patient_id"),
            facility_type=payload.get("facility_type"),
            jti=payload.get("jti"),
            iat=int(payload["iat"]) if payload.get("iat") is not None else None,
            exp=int(payload["exp"]) if payload.get("exp") is not None else None,
        )
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def check_token_revocation(token_data: TokenData) -> None:
    """Raise 401 when the presented token has been revoked.

    Two mechanisms:
        - jti revocation list (single-token logout);
        - per-user issued-at cutoff (force logout everywhere). Legacy tokens
          without an ``iat`` claim are treated as issued at epoch 0, so a
          revoke-all reliably kills them too.
    """
    store = get_revocation_store()
    if token_data.jti and await store.is_jti_revoked(token_data.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )
    cutoff = await store.user_revocation_cutoff(token_data.user_id)
    if cutoff is not None:
        issued_at = float(token_data.iat) if token_data.iat is not None else 0.0
        if issued_at <= cutoff:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token_data = decode_token(credentials.credentials)
    await check_token_revocation(token_data)
    try:
        user_uuid = UUID(token_data.user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return user


def require_role(*roles: UserRole):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        # Super admin bypasses all role checks
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {current_user.role} not authorized. Required: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker


def require_any_department_admin():
    """Allow any department admin (hospital, police, civil defense) or super admin."""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if current_user.role in DEPARTMENT_ADMIN_ROLES:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Department admin role required",
        )
    return checker
