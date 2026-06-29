"""Unit tests for the external-feed integration framework.

These import ONLY the pure / stdlib-only modules (normalize, base, registry,
mock_adapter). They intentionally do NOT import ``apply.py`` or the Hospital
model, so they run without sqlalchemy / geoalchemy2.

Run:
    ENCRYPTION_MASTER_KEY=test python3 -m pytest tests/test_integrations.py -q
"""

import pytest

from app.services.integrations import normalize as N
from app.services.integrations.base import NormalizedFacilityUpdate
from app.services.integrations.registry import (
    AdapterRegistry,
    UnknownSourceError,
)
from app.services.integrations.mock_adapter import GenericJSONFacilityAdapter


# --- status synonym mapping ------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("operational", "operational"),
        ("OPEN", "operational"),
        ("Active", "operational"),
        ("online", "operational"),
        ("limited", "limited"),
        ("partial", "limited"),
        ("degraded", "limited"),
        ("full", "full"),
        ("at_capacity", "full"),
        ("at capacity", "full"),
        ("at-capacity", "full"),
        ("destroyed", "destroyed"),
        ("offline", "destroyed"),
        ("non_functional", "destroyed"),
        ("non-functional", "destroyed"),
        ("closed", "destroyed"),
    ],
)
def test_normalize_status_synonyms(raw, expected):
    assert N.normalize_status(raw) == expected


@pytest.mark.parametrize("raw", ["wat", "", "   ", None, "???", 12345])
def test_normalize_status_unknown_defaults_to_operational(raw):
    assert N.normalize_status(raw) == N.DEFAULT_STATUS == "operational"


# --- int coercion / clamping ----------------------------------------------

def test_coerce_int_basic():
    assert N.coerce_int(7) == 7
    assert N.coerce_int("12") == 12
    assert N.coerce_int("12.9") == 12
    assert N.coerce_int(7.9) == 7


def test_coerce_int_negative_clamped_to_zero():
    assert N.coerce_int(-5) == 0
    assert N.coerce_int("-3") == 0


def test_coerce_int_non_numeric_uses_default():
    assert N.coerce_int("abc") == 0
    assert N.coerce_int(None) == 0
    assert N.coerce_int("abc", default=4) == 4
    # bool is not silently treated as 1/0
    assert N.coerce_int(True, default=9) == 9


def test_coerce_int_max_clamp():
    assert N.coerce_int(500, max_value=100) == 100
    assert N.coerce_int(50, min_value=10, max_value=100) == 50


def test_coerce_float():
    assert N.coerce_float("33.5") == 33.5
    assert N.coerce_float(10) == 10.0
    assert N.coerce_float("nope") is None
    assert N.coerce_float(None, default=0.0) == 0.0


# --- supply-level normalization -------------------------------------------

def test_normalize_supply_levels_clamps_and_coerces():
    out = N.normalize_supply_levels(
        {"blood": "80", "oxygen": 150, "water": -10, "food": 50}
    )
    assert out == {"blood": 80, "oxygen": 100, "water": 0, "food": 50}


def test_normalize_supply_levels_non_mapping():
    assert N.normalize_supply_levels(None) == {}
    assert N.normalize_supply_levels([1, 2, 3]) == {}


def test_normalize_specialties():
    assert N.normalize_specialties(["trauma", " cardiology ", ""]) == [
        "trauma",
        "cardiology",
    ]
    assert N.normalize_specialties("trauma, cardiology") == [
        "trauma",
        "cardiology",
    ]
    assert N.normalize_specialties(None) == []


# --- mock adapter fetch() -> normalize() round trip -----------------------

def test_mock_adapter_roundtrip():
    records = [
        {
            "id": "EXT-001",
            "name": "Central Hospital",
            "status": "at_capacity",
            "beds_total": 200,
            "beds_icu": 30,
            "beds_available": -5,  # should clamp to 0
            "specialties": ["trauma", "cardiology"],
            "supplies": {"blood": 80, "oxygen": 150},  # 150 -> 100
            "lat": 33.51,
            "lng": 36.29,
        }
    ]
    adapter = GenericJSONFacilityAdapter(records)

    raw = adapter.fetch()
    assert raw == records  # fetch returns the raw external records

    update = adapter.normalize(raw[0])
    assert isinstance(update, NormalizedFacilityUpdate)
    assert update.source == "mock_json"
    assert update.external_id == "EXT-001"
    assert update.name == "Central Hospital"
    assert update.status == "full"
    assert update.bed_capacity == 200
    assert update.icu_beds == 30
    assert update.available_beds == 0
    assert update.specialties == ["trauma", "cardiology"]
    assert update.supply_levels == {"blood": 80, "oxygen": 100}
    assert update.latitude == 33.51
    assert update.longitude == 36.29


def test_mock_adapter_missing_keys_leave_none():
    adapter = GenericJSONFacilityAdapter([{"id": "X", "name": "Only Name"}])
    update = adapter.normalize(adapter.fetch()[0])
    assert update.external_id == "X"
    assert update.name == "Only Name"
    assert update.status is None
    assert update.bed_capacity is None
    assert update.supply_levels is None
    assert update.specialties is None
    # mapped_fields excludes meta + None fields
    assert update.mapped_fields() == {}


def test_mock_adapter_fetch_returns_copies():
    records = [{"id": "A", "beds_total": 1}]
    adapter = GenericJSONFacilityAdapter(records)
    fetched = adapter.fetch()
    fetched[0]["beds_total"] = 999
    # internal state untouched
    assert adapter.fetch()[0]["beds_total"] == 1


def test_fetch_normalized_helper():
    adapter = GenericJSONFacilityAdapter(
        [{"id": "1", "status": "open"}, {"id": "2", "status": "offline"}]
    )
    updates = adapter.fetch_normalized()
    assert [u.status for u in updates] == ["operational", "destroyed"]


# --- registry register / get / unknown-raises -----------------------------

def test_registry_register_and_get():
    reg = AdapterRegistry()
    adapter = GenericJSONFacilityAdapter([])
    reg.register(adapter)
    assert reg.get("mock_json") is adapter
    assert reg.all_adapters() == [adapter]


def test_registry_unknown_source_raises():
    reg = AdapterRegistry()
    with pytest.raises(UnknownSourceError):
        reg.get("does_not_exist")


def test_registry_blank_source_name_rejected():
    reg = AdapterRegistry()

    class Bad(GenericJSONFacilityAdapter):
        source_name = ""

    with pytest.raises(ValueError):
        reg.register(Bad([]))


def test_registry_unregister_and_clear():
    reg = AdapterRegistry()
    reg.register(GenericJSONFacilityAdapter([]))
    reg.unregister("mock_json")
    with pytest.raises(UnknownSourceError):
        reg.get("mock_json")
