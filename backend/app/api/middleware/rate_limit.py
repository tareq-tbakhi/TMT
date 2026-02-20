"""
Rate limiting middleware using Redis sliding window.

Usage:
    from app.api.middleware.rate_limit import RateLimiter, rate_limit

    # As a dependency on a route:
    @router.post("/sos", dependencies=[Depends(rate_limit(max_requests=5, window_seconds=60))])
    async def create_sos(...):
        ...

    # Global middleware is attached in main.py via RateLimitMiddleware.
"""

import time
import logging
from typing import Optional

from fastapi import Request, HTTPException, Depends
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# In-memory fallback when Redis is unavailable
_memory_store: dict[str, list[float]] = {}


async def _get_redis():
    """Get a Redis connection from the app's pool, or None."""
    try:
        from app.config import get_settings
        import redis.asyncio as aioredis

        settings = get_settings()
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        yield r
        await r.aclose()
    except Exception:
        yield None


async def _check_rate_limit_redis(
    redis_client, key: str, max_requests: int, window: int
) -> tuple[bool, int]:
    """Check rate limit using Redis sorted set sliding window."""
    now = time.time()
    pipeline = redis_client.pipeline()
    pipeline.zremrangebyscore(key, 0, now - window)
    pipeline.zadd(key, {str(now): now})
    pipeline.zcard(key)
    pipeline.expire(key, window)
    results = await pipeline.execute()
    count = results[2]
    return count > max_requests, count


def _check_rate_limit_memory(
    key: str, max_requests: int, window: int
) -> tuple[bool, int]:
    """Fallback in-memory rate limiter (single-process only)."""
    now = time.time()
    if key not in _memory_store:
        _memory_store[key] = []

    # Remove expired entries
    _memory_store[key] = [t for t in _memory_store[key] if t > now - window]
    _memory_store[key].append(now)
    count = len(_memory_store[key])
    return count > max_requests, count


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_prefix: str = "rl",
):
    """FastAPI dependency for per-route rate limiting.

    Args:
        max_requests: Maximum requests allowed in the window.
        window_seconds: Sliding window size in seconds.
        key_prefix: Redis key prefix for this limiter.
    """

    async def _dependency(request: Request):
        client_ip = _get_client_ip(request)
        path = request.url.path
        key = f"{key_prefix}:{path}:{client_ip}"

        try:
            from app.config import get_settings
            import redis.asyncio as aioredis

            settings = get_settings()
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                exceeded, count = await _check_rate_limit_redis(
                    r, key, max_requests, window_seconds
                )
            finally:
                await r.aclose()
        except Exception:
            exceeded, count = _check_rate_limit_memory(
                key, max_requests, window_seconds
            )

        if exceeded:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s.",
                headers={"Retry-After": str(window_seconds)},
            )

    return Depends(_dependency)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Global rate limiting middleware.

    Applies a generous global limit to all requests per IP.
    Use the `rate_limit()` dependency for stricter per-route limits.
    """

    def __init__(
        self,
        app,
        max_requests: int = 200,
        window_seconds: int = 60,
    ):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next):
        client_ip = _get_client_ip(request)
        key = f"global_rl:{client_ip}"

        exceeded = False
        try:
            from app.config import get_settings
            import redis.asyncio as aioredis

            settings = get_settings()
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                exceeded, count = await _check_rate_limit_redis(
                    r, key, self.max_requests, self.window_seconds
                )
            finally:
                await r.aclose()
        except Exception:
            exceeded, count = _check_rate_limit_memory(
                key, self.max_requests, self.window_seconds
            )

        if exceeded:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Max {self.max_requests} requests per {self.window_seconds}s."
                },
                headers={"Retry-After": str(self.window_seconds)},
            )

        response = await call_next(request)
        return response
