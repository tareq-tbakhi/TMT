from fastapi import Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.audit_log import AuditLog


async def log_audit(
    action: str,
    resource: str,
    resource_id: str = None,
    user_id=None,
    details: str = None,
    request: Request = None,
    db: AsyncSession = None,
):
    ip = request.client.host if request else None
    user_agent = request.headers.get("user-agent") if request else None

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
