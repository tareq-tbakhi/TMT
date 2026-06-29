"""
Unit tests for the default-OFF Telegram user-session ingestion gate.

The covert user-session scraping path (Telethon phone sign-in, JoinChannelRequest
auto-join, iter_messages scraping) is legally sensitive (Telegram ToS /
data-protection) and must NOT run unless TELEGRAM_INGESTION_ENABLED is
deliberately turned on.

These tests prove:
  * With the flag False (default) the config guard reports "not allowed",
    the join/scrape client functions refuse to run (no Telethon join/iter
    calls) and return the structured disabled shape, and the Celery task
    early-returns {"status": "disabled", ...}.
  * With the flag True the guards proceed (Telethon is mocked — no network).

telethon / celery / socketio are not required to be installed: we inject
lightweight stub modules into sys.modules so the gated modules import cleanly,
and we mock the Telethon client so nothing touches the network.

Run:  ENCRYPTION_MASTER_KEY=test python3 -m pytest tests/test_telegram_ingestion_gate.py -q
"""

import os
import sys
import types

import pytest

os.environ.setdefault("ENCRYPTION_MASTER_KEY", "test")

from app.config import Settings, get_settings


# --------------------------------------------------------------------------- #
# Stub out optional heavy/native deps so the gated modules import without them.
# --------------------------------------------------------------------------- #
def _install_telethon_stub():
    if "telethon" in sys.modules:
        return
    telethon = types.ModuleType("telethon")

    class _TelegramClient:  # placeholder; tests patch get_telegram_client
        def __init__(self, *a, **k):
            pass

    telethon.TelegramClient = _TelegramClient
    telethon.events = types.SimpleNamespace(NewMessage=lambda *a, **k: object())

    tl = types.ModuleType("telethon.tl")
    tl_functions = types.ModuleType("telethon.tl.functions")
    tl_functions_channels = types.ModuleType("telethon.tl.functions.channels")
    tl_functions_channels.JoinChannelRequest = lambda *a, **k: ("JOIN", a, k)
    tl_types = types.ModuleType("telethon.tl.types")
    tl_types.Channel = type("Channel", (), {})
    tl_types.Chat = type("Chat", (), {})
    tl_types.User = type("User", (), {})
    errors = types.ModuleType("telethon.errors")
    errors.SessionPasswordNeededError = type(
        "SessionPasswordNeededError", (Exception,), {}
    )

    sys.modules["telethon"] = telethon
    sys.modules["telethon.tl"] = tl
    sys.modules["telethon.tl.functions"] = tl_functions
    sys.modules["telethon.tl.functions.channels"] = tl_functions_channels
    sys.modules["telethon.tl.types"] = tl_types
    sys.modules["telethon.errors"] = errors


def _install_task_stubs():
    if "socketio" not in sys.modules:
        socketio = types.ModuleType("socketio")
        socketio.RedisManager = lambda *a, **k: types.SimpleNamespace(
            emit=lambda *a, **k: None
        )
        sys.modules["socketio"] = socketio
    # Stub the celery_app so importing tasks.telegram_tasks doesn't need celery.
    if "tasks.celery_app" not in sys.modules:
        celery_app_mod = types.ModuleType("tasks.celery_app")

        class _Celery:
            def task(self, *a, **k):
                def deco(fn):
                    return fn

                return deco

        celery_app_mod.celery_app = _Celery()
        sys.modules["tasks.celery_app"] = celery_app_mod


_install_telethon_stub()
_install_task_stubs()


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """get_settings() is lru_cache'd — clear between tests so env changes apply."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _settings(enabled: bool) -> Settings:
    return Settings(
        ENCRYPTION_MASTER_KEY="test",
        TELEGRAM_INGESTION_ENABLED=enabled,
    )


# --------------------------------------------------------------------------- #
# 1. Pure config guard
# --------------------------------------------------------------------------- #
def test_default_is_off():
    s = Settings(ENCRYPTION_MASTER_KEY="test")
    assert s.TELEGRAM_INGESTION_ENABLED is False
    assert s.telegram_ingestion_allowed() is False


def test_explicit_enable():
    assert _settings(True).telegram_ingestion_allowed() is True


# --------------------------------------------------------------------------- #
# 2. Client join/scrape guards
# --------------------------------------------------------------------------- #
def _patch_client_settings(monkeypatch, enabled: bool):
    import app.telegram.client as client

    monkeypatch.setattr(client, "get_settings", lambda: _settings(enabled))
    return client


def test_join_channel_disabled_does_not_call_telethon(monkeypatch):
    import asyncio

    client = _patch_client_settings(monkeypatch, enabled=False)

    called = {"get_client": False}

    async def _boom(*a, **k):
        called["get_client"] = True
        raise AssertionError("get_telegram_client must not be called when disabled")

    monkeypatch.setattr(client, "get_telegram_client", _boom)

    result = asyncio.run(client.join_channel("@some_channel"))
    assert result is False
    assert called["get_client"] is False


def test_get_channel_messages_disabled_does_not_iter(monkeypatch):
    import asyncio

    client = _patch_client_settings(monkeypatch, enabled=False)

    async def _boom(*a, **k):
        raise AssertionError("scrape path must not run when disabled")

    monkeypatch.setattr(client, "get_telegram_client", _boom)

    result = asyncio.run(client.get_channel_messages("12345", limit=5))
    assert result == []


def test_start_auth_flow_disabled_returns_structured_status(monkeypatch):
    import asyncio

    client = _patch_client_settings(monkeypatch, enabled=False)

    # If it tried to sign in it would construct a TelegramClient; make that blow up.
    monkeypatch.setattr(
        client,
        "TelegramClient",
        lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("must not create client when disabled")
        ),
    )

    result = asyncio.run(client.start_auth_flow())
    assert result == {"status": "disabled", "reason": "telegram_ingestion_disabled"}


def test_join_channel_enabled_calls_telethon(monkeypatch):
    import asyncio

    client = _patch_client_settings(monkeypatch, enabled=True)

    join_called = {"hit": False}

    class _FakeChannel(client.Channel):  # passes isinstance(entity, Channel)
        pass

    class _FakeClient:
        async def get_entity(self, ident):
            return _FakeChannel()

        def __call__(self, request):
            # join_channel does:  await client(JoinChannelRequest(entity))
            join_called["hit"] = True

            async def _coro():
                return None

            return _coro()

    async def _get_client(*a, **k):
        return _FakeClient()

    monkeypatch.setattr(client, "get_telegram_client", _get_client)
    # avoid the 5s human-pacing sleep
    async def _no_sleep(*a, **k):
        return None

    monkeypatch.setattr(client.asyncio, "sleep", _no_sleep)

    result = asyncio.run(client.join_channel("@some_channel"))
    assert result is True
    assert join_called["hit"] is True


# --------------------------------------------------------------------------- #
# 3. Celery task early-return
# --------------------------------------------------------------------------- #
def test_fetch_task_disabled_early_returns(monkeypatch):
    import tasks.telegram_tasks as tt

    # The task uses its module-level get_settings binding — patch it where it is
    # looked up (tasks.telegram_tasks.get_settings).
    monkeypatch.setattr(tt, "get_settings", lambda: _settings(False))

    result = tt.fetch_and_process_messages()
    assert result == {"status": "disabled", "reason": "telegram_ingestion_disabled"}


def test_fetch_task_enabled_proceeds_past_gate(monkeypatch):
    import tasks.telegram_tasks as tt

    sentinel = object()

    # Stub the CrewAI path so the task proceeds past the gate without network.
    fake_crews = types.ModuleType("app.services.ai_agent.crews")

    class _Crew:
        def kickoff(self):
            return types.SimpleNamespace(raw=sentinel)

    fake_crews.build_intel_crew = lambda: _Crew()
    monkeypatch.setitem(sys.modules, "app.services.ai_agent.crews", fake_crews)

    # Flag ON + GLM key present so the CrewAI branch is taken past the gate.
    enabled = Settings(
        ENCRYPTION_MASTER_KEY="test",
        TELEGRAM_INGESTION_ENABLED=True,
        GLM_API_KEY="fake-key",
    )
    monkeypatch.setattr(tt, "get_settings", lambda: enabled)

    result = tt.fetch_and_process_messages()
    # Proceeded past the gate into the CrewAI branch.
    assert result is sentinel
