"""Adapter contract + normalized payload shape.

PURITY CONTRACT
---------------
Importable with the **stdlib only** (no sqlalchemy / geoalchemy2). Status is
carried as a plain string (the ``FacilityStatus.value``), produced by
:func:`app.services.integrations.normalize.normalize_status`, so that this
contract can be exercised in a test sandbox without the DB stack.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class NormalizedFacilityUpdate:
    """A source-agnostic, internal-model-aligned facility update.

    Every field is optional except :attr:`source`: a given feed may only carry
    a subset of attributes, and ``apply`` only writes the fields that are not
    ``None``. Field names mirror :class:`app.models.hospital.Hospital`.
    """

    source: str

    # Identity / matching keys.
    external_id: Optional[str] = None
    name: Optional[str] = None

    # Status (plain FacilityStatus.value string, e.g. "operational").
    status: Optional[str] = None

    # Location.
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Hospital capacity.
    bed_capacity: Optional[int] = None
    icu_beds: Optional[int] = None
    available_beds: Optional[int] = None
    specialties: Optional[List[str]] = None
    supply_levels: Optional[Dict[str, int]] = None

    # Police.
    patrol_units: Optional[int] = None
    available_units: Optional[int] = None

    # Civil defense.
    rescue_teams: Optional[int] = None
    available_teams: Optional[int] = None

    # Untouched original record, for audit/debug.
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)

    def mapped_fields(self) -> Dict[str, Any]:
        """Return the non-None Hospital column updates (excludes meta fields)."""
        meta = {"source", "external_id", "name", "raw"}
        return {
            k: v
            for k, v in asdict(self).items()
            if k not in meta and v is not None
        }


class IntegrationAdapter(ABC):
    """Abstract base for an external facility data-feed adapter.

    Concrete adapters implement two responsibilities:

    - :meth:`fetch` returns *raw* external records (list of dicts). For real
      adapters this would hit an API / read a file; implementations MUST NOT
      perform network/IO in this cycle.
    - :meth:`normalize` maps one raw record to a
      :class:`NormalizedFacilityUpdate`, typically using
      :mod:`app.services.integrations.normalize`.
    """

    #: Stable identifier for this source (used by the registry).
    source_name: str = ""

    @abstractmethod
    def fetch(self) -> List[dict]:
        """Return raw external records as a list of dicts."""
        raise NotImplementedError

    @abstractmethod
    def normalize(self, raw: dict) -> NormalizedFacilityUpdate:
        """Map a single raw record to a :class:`NormalizedFacilityUpdate`."""
        raise NotImplementedError

    def fetch_normalized(self) -> List[NormalizedFacilityUpdate]:
        """Convenience: ``fetch()`` then ``normalize()`` each record."""
        return [self.normalize(record) for record in self.fetch()]
