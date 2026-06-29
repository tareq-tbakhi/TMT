"""DB-applying glue for normalized facility updates.

NOTE / SCOPE
------------
This module imports sqlalchemy and the Hospital model, so it is **not** part of
the stdlib-only tested core and is intentionally excluded from
``tests/test_integrations.py`` (it requires the DB stack). It is verified by
``py_compile`` only in this cycle. Nothing here auto-executes — no scheduler,
no route wiring. A caller must explicitly invoke
:func:`apply_facility_update`.

Matching strategy: prefer ``external_id`` (when feeds carry a stable id and the
column exists), otherwise fall back to a case-insensitive ``name`` match. Only
non-None mapped fields are written, so partial feeds never clobber existing
data.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hospital import Hospital
from .base import NormalizedFacilityUpdate

logger = logging.getLogger(__name__)


async def _find_facility(
    db: AsyncSession, normalized: NormalizedFacilityUpdate
) -> Optional[Hospital]:
    # external_id is not (yet) a Hospital column; match on name for now.
    # When an external_id column is added, prefer it here.
    if normalized.external_id and hasattr(Hospital, "external_id"):
        result = await db.execute(
            select(Hospital).where(
                getattr(Hospital, "external_id") == normalized.external_id
            )
        )
        facility = result.scalar_one_or_none()
        if facility is not None:
            return facility

    if normalized.name:
        result = await db.execute(
            select(Hospital).where(Hospital.name == normalized.name)
        )
        return result.scalar_one_or_none()

    return None


async def apply_facility_update(
    db: AsyncSession, normalized: NormalizedFacilityUpdate
) -> bool:
    """Apply a normalized update to a matching Hospital row.

    Returns ``True`` if a facility was found and updated, ``False`` otherwise.
    The caller is responsible for committing the transaction.
    """
    facility = await _find_facility(db, normalized)
    if facility is None:
        logger.info(
            "integrations.apply: no facility matched update from source=%s "
            "external_id=%s name=%s",
            normalized.source,
            normalized.external_id,
            normalized.name,
        )
        return False

    updates = normalized.mapped_fields()
    for column, value in updates.items():
        if hasattr(facility, column):
            setattr(facility, column, value)

    db.add(facility)
    await db.flush()
    logger.info(
        "integrations.apply: updated facility id=%s from source=%s fields=%s",
        getattr(facility, "id", None),
        normalized.source,
        sorted(updates),
    )
    return True
