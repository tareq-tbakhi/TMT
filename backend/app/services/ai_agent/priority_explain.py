"""
Pure, dependency-free explainability for the rule-based triage priority scorer.

This module is the SINGLE SOURCE OF TRUTH for how the deterministic priority
score is derived. It produces SHAP-style factor attributions whose signed
contributions, starting from the base, sum EXACTLY to the pre-clamp total
(exact, not approximate, because the underlying model is a deterministic rule
model).

It intentionally imports nothing heavy (no httpx, no DB, no settings) so it can
be unit-tested in isolation.
"""
from typing import Optional


def explain_priority(
    sos_data: dict,
    patient_info: Optional[dict] = None,
    medical_records: Optional[list[dict]] = None,
    nearby_alerts: Optional[list[dict]] = None,
    nearby_telegram_events: Optional[list[dict]] = None,
) -> dict:
    """
    Compute the rule-based priority score together with a structured, faithful
    explanation.

    Returns a dict:
        {
          "priority_score": int 0-100,          # clamp(total_before_clamp, 0, 100)
          "attributions": [                      # signed, sum -> total_before_clamp
              {"factor": str, "contribution": int, "detail": str}, ...
          ],
          "priority_factors": [str, ...],        # backward-compatible strings
          "base": int,                           # severity * 10
          "total_before_clamp": int,             # base + sum(non-base contributions)
          "clamped": bool,                       # whether the clamp changed the value
        }

    Invariant: base + sum(contribution for non-base attributions) == total_before_clamp,
    and equivalently sum(contribution for ALL attributions) == total_before_clamp,
    where the first attribution is the base. priority_score == clamp(total, 0, 100).
    """
    attributions: list[dict] = []
    factors: list[str] = []

    def add(factor: str, contribution: int, detail: str, human: str) -> None:
        # source="rule" marks these as exact, deterministic attributions —
        # mirrors the LLM path which tags its best-effort factors source="llm".
        attributions.append(
            {
                "factor": factor,
                "contribution": int(contribution),
                "detail": detail,
                "source": "rule",
            }
        )
        factors.append(human)

    # Base score from SOS severity (1-5 -> 10-50). Appended directly (rather than
    # via add()) because its detail/human strings don't follow the add() pattern.
    sev = sos_data.get("severity", 3)
    base = sev * 10
    attributions.append(
        {
            "factor": "sos_severity",
            "contribution": int(base),
            "detail": f"SOS severity {sev}/5 (base = severity * 10)",
            "source": "rule",
        }
    )
    factors.append(f"SOS severity {sev}/5: +{base}")

    # Patient status
    status = sos_data.get("patient_status", "")
    if status == "trapped":
        add(
            "patient_status_trapped",
            20,
            "Patient reported as trapped",
            "Patient trapped: +20",
        )
    elif status == "injured":
        add(
            "patient_status_injured",
            10,
            "Patient reported as injured",
            "Patient injured: +10",
        )

    # Patient vulnerability (mobility / living situation)
    if patient_info:
        mobility = patient_info.get("mobility", "")
        if mobility in ("bedridden", "wheelchair"):
            add(
                "mobility",
                20,
                f"Reduced mobility: {mobility}",
                f"Mobility {mobility}: +20",
            )
        living = patient_info.get("living_situation", "")
        if living == "alone":
            add(
                "living_alone",
                10,
                "Patient lives alone",
                "Living alone: +10",
            )

    # Medical conditions / equipment (equipment takes precedence over conditions)
    if medical_records:
        conditions: set = set()
        equipment: set = set()
        for rec in medical_records:
            conditions.update(rec.get("conditions", []))
            equipment.update(rec.get("special_equipment", []))
        if equipment:
            eq_list = ", ".join(list(equipment)[:3])
            add(
                "special_equipment",
                20,
                f"Requires special equipment: {eq_list}",
                f"Requires equipment ({eq_list}): +20",
            )
        elif conditions:
            cond_list = ", ".join(list(conditions)[:3])
            add(
                "medical_conditions",
                10,
                f"Has chronic conditions: {cond_list}",
                f"Has conditions ({cond_list}): +10",
            )

    # Alert density
    if nearby_alerts and len(nearby_alerts) >= 3:
        n = len(nearby_alerts)
        density_bonus = min(20, n * 2)
        add(
            "nearby_alert_density",
            density_bonus,
            f"{n} active alerts nearby (capped at +20)",
            f"{n} nearby alerts: +{density_bonus}",
        )

    # Telegram intel corroboration
    if nearby_telegram_events and len(nearby_telegram_events) > 0:
        add(
            "telegram_corroboration",
            10,
            f"{len(nearby_telegram_events)} corroborating Telegram event(s)",
            "Telegram intel confirms activity: +10",
        )

    # Patient trust score penalty (negative contribution)
    if patient_info:
        trust = patient_info.get("trust_score", 1.0)
        false_alarms = patient_info.get("false_alarm_count", 0)
        if trust < 0.3:
            add(
                "trust_penalty",
                -20,
                f"Low trust score {trust:.2f} ({false_alarms} false alarms)",
                f"Low trust score ({trust:.2f}, {false_alarms} false alarms): -20",
            )
        elif trust < 0.5:
            add(
                "trust_penalty",
                -10,
                f"Reduced trust score {trust:.2f} ({false_alarms} false alarms)",
                f"Reduced trust ({trust:.2f}, {false_alarms} false alarms): -10",
            )

    # The sum of ALL contributions (base is the first attribution) is the
    # pre-clamp total — this is the exactness guarantee.
    total_before_clamp = sum(a["contribution"] for a in attributions)
    priority_score = max(0, min(100, total_before_clamp))
    clamped = priority_score != total_before_clamp

    return {
        "priority_score": int(priority_score),
        "attributions": attributions,
        "priority_factors": factors,
        "base": int(base),
        "total_before_clamp": int(total_before_clamp),
        "clamped": bool(clamped),
    }
