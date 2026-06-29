"""A tiny registry of integration adapters keyed by ``source_name``.

Stdlib-only; safe to import in tests.
"""

from __future__ import annotations

from typing import Dict, List

from .base import IntegrationAdapter


class UnknownSourceError(KeyError):
    """Raised when an adapter is requested for an unregistered source."""


class AdapterRegistry:
    """Maps ``source_name`` -> :class:`IntegrationAdapter` instance."""

    def __init__(self) -> None:
        self._adapters: Dict[str, IntegrationAdapter] = {}

    def register(self, adapter: IntegrationAdapter) -> IntegrationAdapter:
        """Register an adapter. Raises ``ValueError`` on a blank source name."""
        name = getattr(adapter, "source_name", "") or ""
        if not name:
            raise ValueError(
                "Adapter must define a non-empty 'source_name' to register."
            )
        self._adapters[name] = adapter
        return adapter

    def get(self, source_name: str) -> IntegrationAdapter:
        """Return the adapter for ``source_name`` or raise ``UnknownSourceError``."""
        try:
            return self._adapters[source_name]
        except KeyError:
            known = ", ".join(sorted(self._adapters)) or "<none>"
            raise UnknownSourceError(
                f"No integration adapter registered for source "
                f"{source_name!r}. Known sources: {known}."
            )

    def all_adapters(self) -> List[IntegrationAdapter]:
        """Return all registered adapters."""
        return list(self._adapters.values())

    def unregister(self, source_name: str) -> None:
        """Remove an adapter if present (no error if absent)."""
        self._adapters.pop(source_name, None)

    def clear(self) -> None:
        """Drop all registrations (useful for test isolation)."""
        self._adapters.clear()


# Module-level default registry + thin functional facade.
_default_registry = AdapterRegistry()


def register(adapter: IntegrationAdapter) -> IntegrationAdapter:
    return _default_registry.register(adapter)


def get(source_name: str) -> IntegrationAdapter:
    return _default_registry.get(source_name)


def all_adapters() -> List[IntegrationAdapter]:
    return _default_registry.all_adapters()
