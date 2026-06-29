"""
Unit tests for the pure priority explainability module.

These tests import ONLY the pure module (no DB, no httpx, no settings), so they
run fast and in isolation:

    ENCRYPTION_MASTER_KEY=test python3 -m pytest tests/test_priority_explain.py -q
"""
from app.services.ai_agent.priority_explain import explain_priority


def _sum_contribs(exp):
    return sum(a["contribution"] for a in exp["attributions"])


def test_attributions_sum_to_total_and_clamp_holds():
    """Single source of truth: contributions sum to total_before_clamp,
    and priority_score == clamp(total_before_clamp, 0, 100)."""
    exp = explain_priority(
        {"severity": 4, "patient_status": "trapped"},
        patient_info={"mobility": "bedridden", "living_situation": "alone"},
        medical_records=[{"special_equipment": ["oxygen"]}],
        nearby_alerts=[{}, {}, {}, {}],
        nearby_telegram_events=[{"title": "x"}],
        # no trust penalty
    )
    assert _sum_contribs(exp) == exp["total_before_clamp"]
    assert exp["priority_score"] == max(0, min(100, exp["total_before_clamp"]))


def test_worked_example():
    """severity=4 (base 40) + trapped (+20) + bedridden (+20) + alone (+10) = 90."""
    exp = explain_priority(
        {"severity": 4, "patient_status": "trapped"},
        patient_info={"mobility": "bedridden", "living_situation": "alone"},
    )
    assert exp["base"] == 40
    assert exp["total_before_clamp"] == 90
    assert exp["priority_score"] == 90
    assert exp["clamped"] is False

    factors = {a["factor"]: a["contribution"] for a in exp["attributions"]}
    assert factors["sos_severity"] == 40
    assert factors["patient_status_trapped"] == 20
    assert factors["mobility"] == 20
    assert factors["living_alone"] == 10
    # contributions still sum to total
    assert _sum_contribs(exp) == 90


def test_trust_penalty_is_negative():
    exp = explain_priority(
        {"severity": 3},
        patient_info={"trust_score": 0.2, "false_alarm_count": 5},
    )
    penalties = [a for a in exp["attributions"] if a["factor"] == "trust_penalty"]
    assert len(penalties) == 1
    assert penalties[0]["contribution"] == -20
    assert penalties[0]["contribution"] < 0
    # base 30 - 20 = 10
    assert exp["total_before_clamp"] == 10
    assert exp["priority_score"] == 10

    # reduced-trust tier (< 0.5) gives -10
    exp2 = explain_priority(
        {"severity": 3},
        patient_info={"trust_score": 0.45, "false_alarm_count": 2},
    )
    pen2 = [a for a in exp2["attributions"] if a["factor"] == "trust_penalty"][0]
    assert pen2["contribution"] == -10


def test_clamping_high():
    """Total > 100 should clamp to 100 and report clamped=True."""
    exp = explain_priority(
        {"severity": 5, "patient_status": "trapped"},  # 50 + 20
        patient_info={"mobility": "wheelchair", "living_situation": "alone"},  # +20 +10
        medical_records=[{"special_equipment": ["dialysis"]}],  # +20
        nearby_alerts=[{}] * 10,  # +20 (capped)
        nearby_telegram_events=[{"t": 1}],  # +10
    )
    assert exp["total_before_clamp"] == 150
    assert exp["priority_score"] == 100
    assert exp["clamped"] is True
    # sum still equals pre-clamp total (exactness preserved)
    assert _sum_contribs(exp) == 150


def test_backward_compat_factor_strings():
    """priority_factors strings still present and match expected legacy format."""
    exp = explain_priority(
        {"severity": 4, "patient_status": "injured"},
        patient_info={"mobility": "bedridden", "living_situation": "alone"},
    )
    pf = exp["priority_factors"]
    assert isinstance(pf, list)
    assert "SOS severity 4/5: +40" in pf
    assert "Patient injured: +10" in pf
    assert "Mobility bedridden: +20" in pf
    assert "Living alone: +10" in pf
    # one string per attribution
    assert len(pf) == len(exp["attributions"])


def test_equipment_takes_precedence_over_conditions():
    exp = explain_priority(
        {"severity": 2},
        medical_records=[{"conditions": ["diabetes"], "special_equipment": ["oxygen"]}],
    )
    factor_names = {a["factor"] for a in exp["attributions"]}
    assert "special_equipment" in factor_names
    assert "medical_conditions" not in factor_names


def test_conditions_only_when_no_equipment():
    exp = explain_priority(
        {"severity": 2},
        medical_records=[{"conditions": ["heart disease"]}],
    )
    factor_names = {a["factor"] for a in exp["attributions"]}
    assert "medical_conditions" in factor_names
    assert "special_equipment" not in factor_names


def test_alert_density_requires_three():
    """Fewer than 3 nearby alerts contributes nothing."""
    exp = explain_priority({"severity": 3}, nearby_alerts=[{}, {}])
    assert all(a["factor"] != "nearby_alert_density" for a in exp["attributions"])
    assert exp["total_before_clamp"] == 30
