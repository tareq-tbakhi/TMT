"""
Human-in-the-Loop (HITL) approval decision logic.

This module contains the SINGLE SOURCE OF TRUTH for deciding whether an alert
must be held for human sign-off before it is broadcast / patients are notified.

It is intentionally PURE (no DB, no I/O, only stdlib + config) so the decision
rule can be unit-tested in isolation.

Rule
----
A high-stakes automated alert (HIGH/CRITICAL severity from an automated source)
must NOT be broadcast until a human approves it. Low/medium severity alerts, or
alerts originating from an explicit human/manual action, are auto-approved.
"""

from __future__ import annotations

# Severities considered high-stakes enough to require human sign-off.
_HIGH_STAKES_SEVERITIES: frozenset[str] = frozenset({"high", "critical"})

# Sources that are produced WITHOUT a human deliberately authoring the alert.
# These are the autonomous inference paths that can produce false positives /
# misinformation, so they are gated behind human review:
#   - "telegram": NLP-classified messages ingested from channels
#   - "system":   internally-generated (e.g. derived/secondary alerts)
#   - None:       unknown / unattributed source -> treat as automated (fail safe)
#
# SAFETY: "sos" is deliberately NOT in this set. An SOS is a citizen's direct
# life-safety distress signal — holding it for admin sign-off would delay
# emergency response, so SOS alerts are always auto-approved and broadcast
# immediately. Likewise explicit human sources ("manual", "coordinator",
# "user_report") are human-initiated and auto-approved.
_AUTOMATED_SOURCES: frozenset[str] = frozenset({"telegram", "system"})


def is_automated_source(source: str | None) -> bool:
    """Return True if *source* is an automated (non-human) alert source.

    ``None`` (unattributed) is treated as automated so we fail safe toward
    requiring approval rather than silently broadcasting.
    """
    if source is None:
        return True
    return source.strip().lower() in _AUTOMATED_SOURCES


def requires_human_approval(severity, source, *, enabled: bool) -> bool:
    """Decide whether an alert must be held for human approval before broadcast.

    Parameters
    ----------
    severity:
        Alert severity. Accepts a plain string ("high") or an enum with a
        ``.value`` attribute (e.g. ``AlertSeverity.HIGH``).
    source:
        Alert source string (e.g. "telegram", "manual") or ``None``.
    enabled:
        Master HITL switch (``settings.HITL_REQUIRED``). When False the gate is
        disabled entirely and everything is auto-approved.

    Returns
    -------
    bool
        True  -> hold as pending_approval (do NOT broadcast / notify).
        False -> auto-approve and broadcast as usual.
    """
    if not enabled:
        return False

    sev = getattr(severity, "value", severity)
    sev = str(sev).strip().lower()
    if sev not in _HIGH_STAKES_SEVERITIES:
        return False

    return is_automated_source(source)
