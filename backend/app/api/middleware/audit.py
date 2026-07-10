"""
Audit logging helpers (features 11.4.1 / 11.4.2).

``log_audit`` writes an :class:`~app.models.audit_log.AuditLog` row inside
the caller's transaction. It is deliberately fail-open: an audit failure is
logged but never breaks the request that triggered it (an SOS must not be
dropped because the audit insert failed).

``mask_phone`` / ``mask_email`` pseudonymize identifiers before they are
embedded in free-text ``details`` (GDPR pseudonymization, feature 11.3.7) —
prefer masked values over raw PII in audit details.
"""

import logging
from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)
settings = get_settings()


def mask_phone(phone: Optional[str]) -> str:
    """Pseudonymize a phone number for logs: ``+97059xxxx379`` -> ``+9705***379``."""
    if not phone:
        return "<none>"
    if len(phone) <= 5:
        return "***"
    return f"{phone[:5]}***{phone[-3:]}"


def mask_email(email: Optional[str]) -> str:
    """Pseudonymize an email for logs: ``wael@example.com`` -> ``w***@example.com``."""
    if not email or "@" not in email:
        return "<none>"
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def _client_ip(request: Request) -> Optional[str]:
    """Client IP; ``X-Forwarded-For`` only trusted behind a known proxy."""
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def log_audit(
    action: str,
    resource: str,
    resource_id: str = None,
    user_id=None,
    details: str = None,
    request: Request = None,
    db: AsyncSession = None,
):
    """Record an audit event. Never raises — audit failure must not break
    the underlying operation (fail-open by design for an emergency system;
    failures are reported to the application log for monitoring)."""
    try:
        if db is None:
            logger.error(
                "Audit event dropped (no DB session): action=%s resource=%s id=%s",
                action, resource, resource_id,
            )
            return

        ip = _client_ip(request) if request else None
        user_agent = request.headers.get("user-agent") if request else None
        if user_agent:
            user_agent = user_agent[:512]

        audit = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=str(resource_id) if resource_id else None,
            details=details,
            ip_address=ip,
            user_agent=user_agent,
        )
        db.add(audit)
        await db.flush()
    except Exception:
        logger.exception(
            "Failed to write audit log: action=%s resource=%s id=%s",
            action, resource, resource_id,
        )
