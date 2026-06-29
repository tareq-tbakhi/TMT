"""Reference in-memory adapter — no network, no IO.

:class:`GenericJSONFacilityAdapter` demonstrates the adapter contract against a
generic JSON shape commonly emitted by agency exports / CSV-to-JSON drops. It
is the template real adapters (HL7/FHIR, vendor REST APIs) should follow:
``fetch()`` produces raw records, ``normalize()`` maps each to a
:class:`NormalizedFacilityUpdate` via the pure helpers in
:mod:`app.services.integrations.normalize`.
"""

from __future__ import annotations

from typing import Any, List, Optional

from .base import IntegrationAdapter, NormalizedFacilityUpdate
from . import normalize as N


class GenericJSONFacilityAdapter(IntegrationAdapter):
    """Adapter over an in-memory list of generic JSON facility records.

    Expected (loose) raw shape::

        {
            "id": "EXT-001",
            "name": "Central Hospital",
            "status": "operational",        # any synonym, see normalize
            "beds_total": 200,
            "beds_icu": 30,
            "beds_available": 45,
            "specialties": ["trauma", "cardiology"],
            "supplies": {"blood": 80, "oxygen": 60},
            "lat": 33.51, "lng": 36.29,
            "patrol_units": ..., "available_units": ...,
            "rescue_teams": ..., "available_teams": ...,
        }

    All keys are optional; missing keys leave the corresponding normalized
    field as ``None`` so downstream ``apply`` won't overwrite existing values.
    """

    source_name = "mock_json"

    def __init__(self, records: Optional[List[dict]] = None) -> None:
        self._records: List[dict] = list(records or [])

    def fetch(self) -> List[dict]:
        # Return copies so callers can't mutate internal state.
        return [dict(r) for r in self._records]

    @staticmethod
    def _opt_int(raw: dict, *keys: str) -> Optional[int]:
        """coerce_int for the first present key; ``None`` if none present."""
        for key in keys:
            if key in raw and raw[key] is not None:
                return N.coerce_int(raw[key], default=0, min_value=0)
        return None

    @staticmethod
    def _first(raw: dict, *keys: str) -> Any:
        for key in keys:
            if key in raw and raw[key] is not None:
                return raw[key]
        return None

    def normalize(self, raw: dict) -> NormalizedFacilityUpdate:
        external_id = self._first(raw, "id", "external_id", "facility_id")
        name = self._first(raw, "name", "facility_name")

        status = (
            N.normalize_status(raw["status"]) if "status" in raw else None
        )

        specialties = (
            N.normalize_specialties(raw["specialties"])
            if "specialties" in raw
            else None
        )
        supply_levels = (
            N.normalize_supply_levels(self._first(raw, "supplies", "supply_levels"))
            if ("supplies" in raw or "supply_levels" in raw)
            else None
        )

        return NormalizedFacilityUpdate(
            source=self.source_name,
            external_id=None if external_id is None else str(external_id),
            name=None if name is None else str(name),
            status=status,
            latitude=N.coerce_float(self._first(raw, "lat", "latitude")),
            longitude=N.coerce_float(self._first(raw, "lng", "lon", "longitude")),
            bed_capacity=self._opt_int(raw, "beds_total", "bed_capacity"),
            icu_beds=self._opt_int(raw, "beds_icu", "icu_beds"),
            available_beds=self._opt_int(raw, "beds_available", "available_beds"),
            specialties=specialties,
            supply_levels=supply_levels,
            patrol_units=self._opt_int(raw, "patrol_units"),
            available_units=self._opt_int(raw, "available_units"),
            rescue_teams=self._opt_int(raw, "rescue_teams"),
            available_teams=self._opt_int(raw, "available_teams"),
            raw=dict(raw),
        )
