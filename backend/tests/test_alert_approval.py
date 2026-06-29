"""
Unit tests for the PURE HITL decision helper.

These run WITHOUT a DB (pure stdlib + config only):
    ENCRYPTION_MASTER_KEY=test python3 -m pytest tests/test_alert_approval.py -q
"""

from app.services.alert_approval import requires_human_approval, is_automated_source


def test_high_telegram_enabled_requires_approval():
    assert requires_human_approval("high", "telegram", enabled=True) is True


def test_critical_system_requires_approval():
    assert requires_human_approval("critical", "system", enabled=True) is True


def test_critical_sos_is_auto_approved_for_safety():
    # SOS is a citizen's direct life-safety distress signal — it must NEVER be
    # held for human approval, even at critical severity.
    assert requires_human_approval("critical", "sos", enabled=True) is False


def test_high_none_source_requires_approval():
    # None (unattributed) is treated as automated -> fail safe
    assert requires_human_approval("high", None, enabled=True) is True


def test_low_telegram_auto_approved():
    assert requires_human_approval("low", "telegram", enabled=True) is False


def test_high_telegram_disabled_auto_approved():
    assert requires_human_approval("high", "telegram", enabled=False) is False


def test_high_manual_auto_approved():
    assert requires_human_approval("high", "manual", enabled=True) is False


def test_critical_coordinator_auto_approved():
    assert requires_human_approval("critical", "coordinator", enabled=True) is False


def test_medium_any_auto_approved():
    assert requires_human_approval("medium", "telegram", enabled=True) is False
    assert requires_human_approval("medium", "system", enabled=True) is False
    assert requires_human_approval("medium", None, enabled=True) is False


def test_enum_like_severity_supported():
    class _Sev:
        value = "critical"

    assert requires_human_approval(_Sev(), "telegram", enabled=True) is True


def test_is_automated_source():
    assert is_automated_source("telegram") is True
    assert is_automated_source("system") is True
    assert is_automated_source("sos") is False  # safety exemption — never held
    assert is_automated_source(None) is True
    assert is_automated_source("manual") is False
    assert is_automated_source("coordinator") is False
    assert is_automated_source("TELEGRAM") is True  # case-insensitive
