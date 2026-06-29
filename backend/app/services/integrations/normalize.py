"""Pure normalization helpers — external representations -> internal values.

PURITY CONTRACT
---------------
This module must stay importable with the **stdlib only**. In particular it
does *not* import :mod:`app.models.hospital` (which pulls in sqlalchemy /
geoalchemy2 and may be uninstallable in the test sandbox).

Instead, the canonical internal status values are duplicated here as plain
strings. These intentionally mirror ``FacilityStatus.value`` in
``app/models/hospital.py``:

    OPERATIONAL = "operational"
    LIMITED     = "limited"
    FULL        = "full"
    DESTROYED   = "destroyed"

If the enum values ever change, update :data:`_VALID_STATUSES` to match.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional


# --- Canonical internal status strings (mirror of FacilityStatus.value) ----
STATUS_OPERATIONAL = "operational"
STATUS_LIMITED = "limited"
STATUS_FULL = "full"
STATUS_DESTROYED = "destroyed"

_VALID_STATUSES = frozenset(
    {STATUS_OPERATIONAL, STATUS_LIMITED, STATUS_FULL, STATUS_DESTROYED}
)

# Default applied when an external status is missing/unrecognized.
#
# Choice: ``operational`` is the safe default. An unknown facility is far more
# likely to be reachable/usable than destroyed; defaulting to a "bad" state
# (e.g. DESTROYED) on a typo would wrongly remove capacity from routing/
# allocation. Callers that need strictness can inspect the raw value first.
DEFAULT_STATUS = STATUS_OPERATIONAL


# Synonym map: lowercase external token -> canonical internal value.
_STATUS_SYNONYMS = {
    # operational
    "operational": STATUS_OPERATIONAL,
    "open": STATUS_OPERATIONAL,
    "active": STATUS_OPERATIONAL,
    "online": STATUS_OPERATIONAL,
    "functional": STATUS_OPERATIONAL,
    "available": STATUS_OPERATIONAL,
    "ok": STATUS_OPERATIONAL,
    # limited
    "limited": STATUS_LIMITED,
    "partial": STATUS_LIMITED,
    "partially_operational": STATUS_LIMITED,
    "degraded": STATUS_LIMITED,
    "reduced": STATUS_LIMITED,
    # full
    "full": STATUS_FULL,
    "at_capacity": STATUS_FULL,
    "at capacity": STATUS_FULL,
    "capacity": STATUS_FULL,
    "no_beds": STATUS_FULL,
    "saturated": STATUS_FULL,
    # destroyed / out of service
    "destroyed": STATUS_DESTROYED,
    "offline": STATUS_DESTROYED,
    "non_functional": STATUS_DESTROYED,
    "non-functional": STATUS_DESTROYED,
    "nonfunctional": STATUS_DESTROYED,
    "out_of_service": STATUS_DESTROYED,
    "closed": STATUS_DESTROYED,
    "inactive": STATUS_DESTROYED,
    "damaged": STATUS_DESTROYED,
}


def normalize_status(raw_status: Any) -> str:
    """Map an external status token to a canonical internal status string.

    Returns one of :data:`_VALID_STATUSES`. Unknown / missing values fall back
    to :data:`DEFAULT_STATUS` (``"operational"``).
    """
    if raw_status is None:
        return DEFAULT_STATUS
    token = str(raw_status).strip().lower()
    if not token:
        return DEFAULT_STATUS
    # Exact canonical value passes straight through.
    if token in _VALID_STATUSES:
        return token
    # Normalize separators so "at-capacity" / "at capacity" both resolve.
    normalized = token.replace("-", "_").replace(" ", "_")
    return _STATUS_SYNONYMS.get(token) or _STATUS_SYNONYMS.get(
        normalized, DEFAULT_STATUS
    )


def coerce_int(
    x: Any, default: int = 0, min_value: int = 0, max_value: Optional[int] = None
) -> int:
    """Coerce ``x`` to an int with sanity clamping.

    - ``None`` / non-numeric / unparseable -> ``default``.
    - floats and numeric strings are accepted ("12", "12.0", 7.9 -> 7).
    - result is clamped to ``[min_value, max_value]`` (``max_value=None`` = unbounded).
    """
    if isinstance(x, bool):
        # bool is an int subclass; treat as default to avoid True->1 surprises.
        value = default
    elif isinstance(x, int):
        value = x
    elif isinstance(x, float):
        value = int(x)
    else:
        try:
            value = int(float(str(x).strip()))
        except (TypeError, ValueError):
            value = default
    if min_value is not None and value < min_value:
        value = min_value
    if max_value is not None and value > max_value:
        value = max_value
    return value


def coerce_float(x: Any, default: Optional[float] = None) -> Optional[float]:
    """Coerce ``x`` to a float (e.g. latitude/longitude); else ``default``."""
    if x is None:
        return default
    if isinstance(x, bool):
        return default
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return float(str(x).strip())
    except (TypeError, ValueError):
        return default


def normalize_specialties(value: Any) -> list:
    """Normalize a specialties list to a clean list of non-empty strings."""
    if value is None:
        return []
    if isinstance(value, str):
        # Allow a comma-separated string as a convenience.
        items = value.split(",")
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
    else:
        return []
    out = []
    for item in items:
        s = str(item).strip()
        if s:
            out.append(s)
    return out


def normalize_supply_levels(
    value: Any, min_value: int = 0, max_value: int = 100
) -> dict:
    """Normalize/validate a supply-levels mapping.

    External feeds report supply levels as a ``{item: level}`` mapping. Levels
    are coerced to ints and clamped to ``[min_value, max_value]`` (default
    0..100, treating the value as a percentage). Non-string keys are
    stringified; non-mapping input yields ``{}``.
    """
    if not isinstance(value, Mapping):
        return {}
    out: dict = {}
    for k, v in value.items():
        key = str(k).strip()
        if not key:
            continue
        out[key] = coerce_int(v, default=min_value, min_value=min_value, max_value=max_value)
    return out
