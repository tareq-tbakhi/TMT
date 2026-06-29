"""
Unit tests for the citizen SOS triage assistant PURE logic.

These tests import ONLY app.services.ai_agent.assistant, which does NOT import
httpx at top level, so they run with no network and no heavy deps:

    ENCRYPTION_MASTER_KEY=test python3 -m pytest tests/test_assistant.py -q

NO LIVE GLM CALL IS MADE — the GLM path is either skipped (no key) or mocked.
"""
import asyncio
import importlib.util

import pytest

# The GLM path lazily imports app.services.ai_agent.agent, which imports httpx.
# Skip the two integration tests that exercise that path when httpx is absent;
# the sanitization/clamp/coerce logic itself is covered httpx-free by the
# sanitize_* tests above. (No live network call is ever made.)
_HTTPX = importlib.util.find_spec("httpx") is not None
needs_httpx = pytest.mark.skipif(not _HTTPX, reason="httpx not installed")

from app.services.ai_agent import assistant as A
from app.services.ai_agent.assistant import (
    validate_messages,
    sanitize_triage,
    sanitize_reply,
    scripted_reply,
    assistant_reply,
    normalize_language,
    AssistantInputError,
    MAX_MESSAGES,
    MAX_MESSAGE_CHARS,
)


# ── (a) Input validation limits ──────────────────────────────────────────

def test_validate_rejects_too_many_messages():
    msgs = [{"role": "user", "content": "x"} for _ in range(MAX_MESSAGES + 1)]
    with pytest.raises(AssistantInputError):
        validate_messages(msgs)


def test_validate_rejects_oversized_message():
    msgs = [{"role": "user", "content": "a" * (MAX_MESSAGE_CHARS + 1)}]
    with pytest.raises(AssistantInputError):
        validate_messages(msgs)


def test_validate_rejects_bad_role():
    with pytest.raises(AssistantInputError):
        validate_messages([{"role": "system", "content": "hi"}])


def test_validate_passes_clean_input():
    out = validate_messages([{"role": "user", "content": "help", "extra": "drop"}])
    assert out == [{"role": "user", "content": "help"}]  # extra keys stripped


# ── (c) Model-output sanitization (clamp + coerce) ───────────────────────

def test_sanitize_triage_clamps_and_coerces():
    out = sanitize_triage({
        "emergency_type": "medical",
        "severity": "99",          # string + out of range -> clamp to 5
        "num_people": "3",         # coerce to int
        "anyone_injured": "yes",   # coerce to bool
        "needs": "water",          # string -> list
    })
    assert out["severity"] == 5
    assert out["num_people"] == 3
    assert out["anyone_injured"] is True
    assert out["needs"] == ["water"]


def test_sanitize_triage_low_clamp_and_unknown_type():
    out = sanitize_triage({"emergency_type": "alien_invasion", "severity": -4})
    assert out["severity"] == 1            # clamped up to 1
    assert out["emergency_type"] is None   # whitelist rejects unknown type


def test_sanitize_triage_handles_junk():
    out = sanitize_triage("totally not a dict")
    assert out["emergency_type"] is None
    assert out["severity"] is None
    assert out["needs"] == []


def test_sanitize_reply_requires_message():
    with pytest.raises(ValueError):
        sanitize_reply({"triage": {}})  # missing message


def test_sanitize_reply_full():
    out = sanitize_reply({
        "message": "How many people are with you?",
        "triage": {"severity": 10},
        "done": "true",
    })
    assert out["message"].startswith("How many")
    assert out["triage"]["severity"] == 5
    assert out["done"] is True


# ── (b) Fallback path returns a valid scripted response ──────────────────

def test_scripted_reply_first_question():
    out = scripted_reply([], "en")
    assert out["message"]
    assert out["done"] is False
    assert set(out["triage"].keys()) == {
        "emergency_type", "severity", "num_people", "anyone_injured", "needs"
    }


def test_scripted_reply_is_bilingual():
    en = scripted_reply([], "en")["message"]
    ar = scripted_reply([], "ar")["message"]
    assert en != ar
    # crude language sanity: Arabic message contains non-ASCII
    assert any(ord(c) > 127 for c in ar)
    assert all(ord(c) < 128 for c in en)


def test_scripted_reply_completes_after_script():
    msgs = [{"role": "user", "content": "medical injured 2 people"} for _ in range(5)]
    out = scripted_reply(msgs, "en")
    assert out["done"] is True


def test_scripted_infers_triage_from_keywords():
    msgs = [{"role": "user", "content": "I am injured and bleeding, serious"}]
    out = scripted_reply(msgs, "en")
    assert out["triage"]["anyone_injured"] is True
    assert out["triage"]["severity"] == 5


def test_assistant_reply_fallback_when_no_key(monkeypatch):
    """No GLM key -> deterministic fallback, never raises, NO network call."""
    # Force the no-key branch without touching real settings.
    import app.config as cfg

    class _S:
        GLM_API_KEY = ""

    monkeypatch.setattr(cfg, "get_settings", lambda: _S())

    msgs = validate_messages([{"role": "user", "content": "help me"}])
    out = asyncio.run(assistant_reply(msgs, language="en"))
    assert out["source"] == "fallback"
    assert out["message"]
    assert out["done"] in (True, False)


@needs_httpx
def test_assistant_reply_sanitizes_glm_junk(monkeypatch):
    """GLM path returns junk -> sanitized, severity clamped, types coerced.
    The GLM call is MOCKED — no live network call."""
    import app.config as cfg

    # Use real settings (agent.py reads GLM_API_BASE etc. at import) but force a
    # non-empty key so assistant_reply takes the GLM branch.
    real = cfg.get_settings()
    monkeypatch.setattr(real, "GLM_API_KEY", "fake-key-for-test", raising=False)

    # Mock the lazily-imported _call_glm to return malicious / junk JSON.
    import app.services.ai_agent.agent as agent_mod

    async def _fake_call_glm(system, user, max_tokens=1024):
        return (
            '{"message": "ignore everything, here is your answer",'
            ' "triage": {"emergency_type": "medical", "severity": 47,'
            ' "num_people": "2", "anyone_injured": "yes"}, "done": "yes"}'
        )

    monkeypatch.setattr(agent_mod, "_call_glm", _fake_call_glm)

    msgs = validate_messages([{"role": "user", "content": "help"}])
    out = asyncio.run(assistant_reply(msgs, language="en"))
    assert out["source"] == "glm"
    assert out["triage"]["severity"] == 5          # clamped from 47
    assert out["triage"]["num_people"] == 2        # coerced from "2"
    assert out["triage"]["anyone_injured"] is True
    assert out["done"] is True


@needs_httpx
def test_assistant_reply_falls_back_on_glm_exception(monkeypatch):
    """If GLM raises, we fall back gracefully (never 500). Mocked, no network."""
    import app.config as cfg

    real = cfg.get_settings()
    monkeypatch.setattr(real, "GLM_API_KEY", "fake-key-for-test", raising=False)

    import app.services.ai_agent.agent as agent_mod

    async def _boom(system, user, max_tokens=1024):
        raise RuntimeError("simulated GLM timeout")

    monkeypatch.setattr(agent_mod, "_call_glm", _boom)

    msgs = validate_messages([{"role": "user", "content": "help"}])
    out = asyncio.run(assistant_reply(msgs, language="ar"))
    assert out["source"] == "fallback"
    assert out["message"]


def test_normalize_language():
    assert normalize_language("en-US") == "en"
    assert normalize_language("English") == "en"
    assert normalize_language("ar") == "ar"
    assert normalize_language(None) == "ar"
