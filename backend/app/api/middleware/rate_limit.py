"""
API rate limiting (feature 11.2.6) — per-IP and per-user sliding windows.

Architecture:
    - ``RateLimitStore`` is the storage interface. The default
      ``InMemoryRateLimitStore`` is single-process; ``RedisRateLimitStore``
      provides multi-worker correctness. ``ResilientStore`` prefers Redis and
      transparently falls back to memory when Redis is unreachable, so the
      emergency platform never fails closed on infrastructure loss.
    - ``RateLimitMiddleware`` (registered in ``main.py``) applies a global
      per-IP limit, a per-user limit for authenticated requests, and strict
      buckets for authentication endpoints (login / registration / OTP codes)
      to slow down credential stuffing and brute force.
    - ``rate_limit()`` is a per-route dependency for endpoint-specific limits.

Usage:
    from app.api.middleware.rate_limit import RateLimiter, rate_limit

    # As a dependency on a route:
    @router.post("/sos", dependencies=[rate_limit(max_requests=5, window_seconds=60)])
    async def create_sos(...):
        ...

    # Global middleware is attached in main.py via RateLimitMiddleware.

All 429 responses carry ``Retry-After`` plus ``X-RateLimit-*`` headers.
"""

import abc
import time
import logging
from collections import deque
from typing import Optional

from fastapi import Request, HTTPException, Depends
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Paths (relative to API_PREFIX) that get strict anti-brute-force buckets.
_AUTH_BUCKET_PATHS = {
    "/auth/login",
    "/patients/login",
    "/hospitals/login",
}
# Registration abuse (mass account creation) — POST only.
_REGISTRATION_BUCKET_PATHS = {"/patients"}
# OTP / verification-code endpoints get the strictest bucket.
_OTP_BUCKET_PATHS = {
    "/telegram/auth/send-code",
    "/telegram/auth/verify-code",
}
# Paths exempt from global limiting (load-balancer health probes).
_EXEMPT_PATHS = {"/health"}


# ---------------------------------------------------------------------------
# Storage interface (swap for Redis in multi-worker deployments)
# ---------------------------------------------------------------------------

class RateLimitStore(abc.ABC):
    """Sliding-window hit counter. Implementations must be async-safe."""

    @abc.abstractmethod
    async def hit(self, key: str, window_seconds: int) -> tuple[int, float]:
        """Record one hit for *key* and return ``(count, retry_after)``.

        ``count`` is the number of hits (including this one) inside the
        window; ``retry_after`` is roughly how many seconds until the oldest
        hit leaves the window (used for the ``Retry-After`` header).
        """


class InMemoryRateLimitStore(RateLimitStore):
    """Single-process sliding-window store with bounded memory.

    Buckets are pruned lazily on access and swept periodically so an
    attacker cannot exhaust memory by spraying unique keys.
    """

    def __init__(self, max_keys: int = 50_000, sweep_interval: float = 60.0):
        self._buckets: dict[str, deque[float]] = {}
        self._max_keys = max_keys
        self._sweep_interval = sweep_interval
        self._last_sweep = time.monotonic()

    async def hit(self, key: str, window_seconds: int) -> tuple[int, float]:
        now = time.time()
        bucket = self._buckets.get(key)
        if bucket is None:
            if len(self._buckets) >= self._max_keys:
                self._evict(now)
            bucket = deque()
            self._buckets[key] = bucket

        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        bucket.append(now)

        self._maybe_sweep(window_seconds)

        retry_after = max(0.0, bucket[0] + window_seconds - now)
        return len(bucket), retry_after

    def _maybe_sweep(self, window_seconds: int) -> None:
        mono = time.monotonic()
        if mono - self._last_sweep < self._sweep_interval:
            return
        self._last_sweep = mono
        cutoff = time.time() - window_seconds
        stale = [k for k, b in self._buckets.items() if not b or b[-1] <= cutoff]
        for k in stale:
            self._buckets.pop(k, None)

    def _evict(self, now: float) -> None:
        """Emergency eviction when at capacity: drop the coldest buckets."""
        by_age = sorted(self._buckets.items(), key=lambda kv: kv[1][-1] if kv[1] else 0.0)
        for k, _ in by_age[: max(1, self._max_keys // 10)]:
            self._buckets.pop(k, None)
        logger.warning("Rate-limit store at capacity — evicted coldest buckets")


class RedisRateLimitStore(RateLimitStore):
    """Redis sorted-set sliding window sharing a single connection pool."""

    def __init__(self, redis_url: Optional[str] = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._client = None

    def _get_client(self):
        if self._client is None:
            import redis.asyncio as aioredis
            self._client = aioredis.from_url(
                self._redis_url, decode_responses=True
            )
        return self._client

    async def hit(self, key: str, window_seconds: int) -> tuple[int, float]:
        r = self._get_client()
        now = time.time()
        member = f"{now:.6f}"
        pipeline = r.pipeline()
        pipeline.zremrangebyscore(key, 0, now - window_seconds)
        pipeline.zadd(key, {member: now})
        pipeline.zcard(key)
        pipeline.zrange(key, 0, 0, withscores=True)
        pipeline.expire(key, window_seconds + 1)
        results = await pipeline.execute()
        count = results[2]
        oldest = results[3]
        retry_after = 0.0
        if oldest:
            oldest_score = oldest[0][1]
            retry_after = max(0.0, oldest_score + window_seconds - now)
        return count, retry_after


class ResilientStore(RateLimitStore):
    """Prefer Redis (multi-worker correctness); degrade to in-memory.

    After a Redis failure the store waits ``cooldown`` seconds before
    retrying so a dead Redis does not add latency to every request.
    """

    def __init__(self, cooldown: float = 30.0):
        self._memory = InMemoryRateLimitStore()
        self._redis: Optional[RedisRateLimitStore] = None
        self._redis_down_until = 0.0
        self._cooldown = cooldown

    async def hit(self, key: str, window_seconds: int) -> tuple[int, float]:
        mono = time.monotonic()
        if mono >= self._redis_down_until:
            try:
                if self._redis is None:
                    self._redis = RedisRateLimitStore()
                return await self._redis.hit(key, window_seconds)
            except Exception as exc:  # pragma: no cover - infra failure path
                self._redis_down_until = mono + self._cooldown
                logger.warning("Rate-limit Redis unavailable (%s); using in-memory fallback", exc)
        return await self._memory.hit(key, window_seconds)


_store: Optional[RateLimitStore] = None


def get_store() -> RateLimitStore:
    """Return the process-wide rate-limit store (lazily created)."""
    global _store
    if _store is None:
        _store = ResilientStore()
    return _store


def set_store(store: RateLimitStore) -> None:
    """Swap the backing store (tests, or a dedicated Redis cluster)."""
    global _store
    _store = store


# ---------------------------------------------------------------------------
# Client identification
# ---------------------------------------------------------------------------

def _get_client_ip(request: Request) -> str:
    """Extract the client IP.

    ``X-Forwarded-For`` is only honoured when ``TRUST_PROXY_HEADERS`` is
    enabled — otherwise any client could spoof the header to rotate
    identities and bypass limits.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_user_id(request: Request) -> Optional[str]:
    """Best-effort extraction of the authenticated user id from the JWT.

    Signature-verified so an attacker cannot select an arbitrary bucket by
    forging tokens. Returns ``None`` for anonymous / invalid credentials —
    those requests are limited per-IP only.
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        from jose import jwt

        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def _bucket_for_path(method: str, path: str) -> Optional[tuple[str, int]]:
    """Return ``(bucket_name, max_requests)`` for strict auth buckets."""
    prefix = settings.API_PREFIX
    if path.startswith(prefix):
        path = path[len(prefix):] or "/"
    if path in _OTP_BUCKET_PATHS and method == "POST":
        return "otp", settings.RATE_LIMIT_OTP_MAX
    if path in _AUTH_BUCKET_PATHS and method == "POST":
        return "auth", settings.RATE_LIMIT_AUTH_MAX
    if path in _REGISTRATION_BUCKET_PATHS and method == "POST":
        return "register", settings.RATE_LIMIT_AUTH_MAX
    return None


def _too_many(detail: str, retry_after: float, limit: int, window: int) -> JSONResponse:
    retry = max(1, int(retry_after + 0.999))
    return JSONResponse(
        status_code=429,
        content={"detail": detail},
        headers={
            "Retry-After": str(retry),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(int(time.time() + retry)),
        },
    )


# ---------------------------------------------------------------------------
# Per-route dependency
# ---------------------------------------------------------------------------

def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_prefix: str = "rl",
    per_user: bool = False,
):
    """FastAPI dependency for per-route rate limiting.

    Args:
        max_requests: Maximum requests allowed in the window.
        window_seconds: Sliding window size in seconds.
        key_prefix: Key prefix for this limiter.
        per_user: When True, authenticated requests are keyed by user id
            instead of client IP (mobile users behind CGNAT share IPs).
    """

    async def _dependency(request: Request):
        if not settings.RATE_LIMIT_ENABLED:
            return
        identity = None
        if per_user:
            identity = _get_user_id(request)
        if identity is None:
            identity = f"ip:{_get_client_ip(request)}"
        else:
            identity = f"user:{identity}"
        key = f"{key_prefix}:{request.url.path}:{identity}"

        try:
            count, retry_after = await get_store().hit(key, window_seconds)
        except Exception:  # never fail closed on limiter errors
            logger.exception("Rate limiter failure — allowing request")
            return

        if count > max_requests:
            retry = max(1, int(retry_after + 0.999))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s.",
                headers={
                    "Retry-After": str(retry),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + retry)),
                },
            )

    return Depends(_dependency)


# ---------------------------------------------------------------------------
# Global middleware
# ---------------------------------------------------------------------------

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Global rate limiting middleware.

    Layers three sliding windows:
        1. Strict per-IP buckets on auth endpoints (login / register / OTP).
        2. A generous global per-IP limit for everything else.
        3. A per-user limit for authenticated traffic (stops a single stolen
           token from hammering the API through rotating IPs).

    Use the ``rate_limit()`` dependency for stricter per-route limits.
    """

    def __init__(
        self,
        app,
        max_requests: int = 200,
        window_seconds: int = 60,
        per_user_max_requests: Optional[int] = None,
    ):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.per_user_max_requests = (
            per_user_max_requests
            if per_user_max_requests is not None
            else settings.RATE_LIMIT_PER_USER
        )

    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or request.url.path in _EXEMPT_PATHS:
            return await call_next(request)
        if request.method == "OPTIONS":  # CORS preflight
            return await call_next(request)

        client_ip = _get_client_ip(request)
        store = get_store()
        limit = self.max_requests
        remaining = limit

        try:
            # 1. Strict buckets for authentication endpoints
            bucket = _bucket_for_path(request.method, request.url.path)
            if bucket is not None:
                name, bucket_max = bucket
                count, retry_after = await store.hit(
                    f"rl:{name}:{request.url.path}:ip:{client_ip}", self.window_seconds
                )
                if count > bucket_max:
                    logger.warning(
                        "Auth rate limit hit: bucket=%s ip=%s path=%s",
                        name, client_ip, request.url.path,
                    )
                    return _too_many(
                        "Too many attempts. Please try again later.",
                        retry_after, bucket_max, self.window_seconds,
                    )
                limit = bucket_max
                remaining = max(0, bucket_max - count)

            # 2. Global per-IP limit
            count, retry_after = await store.hit(
                f"rl:global:ip:{client_ip}", self.window_seconds
            )
            if count > self.max_requests:
                return _too_many(
                    f"Rate limit exceeded. Max {self.max_requests} requests per {self.window_seconds}s.",
                    retry_after, self.max_requests, self.window_seconds,
                )
            if bucket is None:
                limit = self.max_requests
                remaining = max(0, self.max_requests - count)

            # 3. Per-user limit for authenticated traffic
            user_id = _get_user_id(request)
            if user_id:
                count, retry_after = await store.hit(
                    f"rl:global:user:{user_id}", self.window_seconds
                )
                if count > self.per_user_max_requests:
                    return _too_many(
                        f"Rate limit exceeded. Max {self.per_user_max_requests} requests per {self.window_seconds}s.",
                        retry_after, self.per_user_max_requests, self.window_seconds,
                    )
        except Exception:  # limiter must never take the API down
            logger.exception("Rate limiter middleware failure — allowing request")
            return await call_next(request)

        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(limit))
        response.headers.setdefault("X-RateLimit-Remaining", str(remaining))
        return response
