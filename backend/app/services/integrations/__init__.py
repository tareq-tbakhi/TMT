"""External data-feed integration framework.

This package provides the *seam* for ingesting external hospital / agency
data feeds (HL7/FHIR, agency REST APIs, CSV/JSON drops) into the platform's
internal :class:`~app.models.hospital.Hospital` (Facility) model.

Design goals
------------
- **Pluggable**: every external source is an :class:`IntegrationAdapter`.
- **Pure normalization**: :mod:`app.services.integrations.normalize` and the
  adapter contract are importable with the *stdlib only* (no sqlalchemy /
  geoalchemy2), so the mapping logic is fully unit-testable in a sandbox.
- **Additive & inert**: nothing here auto-executes, hits the network, or
  touches the DB unless a caller explicitly invokes ``apply.apply_facility_update``.

Nothing in this package is wired into routes/schedulers in this cycle.
"""

from .base import IntegrationAdapter, NormalizedFacilityUpdate
from .registry import (
    AdapterRegistry,
    UnknownSourceError,
    register,
    get,
    all_adapters,
)

__all__ = [
    "IntegrationAdapter",
    "NormalizedFacilityUpdate",
    "AdapterRegistry",
    "UnknownSourceError",
    "register",
    "get",
    "all_adapters",
]
