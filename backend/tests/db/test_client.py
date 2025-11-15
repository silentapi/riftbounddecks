"""Unit tests for MongoDB client lifecycle helpers."""

from __future__ import annotations

from typing import AsyncIterator

import pytest

from backend.app.core.config import AppSettings
from backend.app.db.client import MongoClientManager


class DummyMotorClient:
    """Simple stand-in for the Motor client to avoid real DB connections."""

    def __init__(self, uri: str) -> None:  # pragma: no cover - trivial init
        self.uri = uri
        self.closed = False

    def close(self) -> None:  # pragma: no cover - trivial behaviour
        self.closed = True


@pytest.fixture
def settings() -> AppSettings:
    """Return deterministic settings for the tests."""
    return AppSettings(
        mongodb_uri="mongodb://localhost:27017/test",
        jwt_secret="unit-test-secret",
        jwt_expires_in=3600,
    )


@pytest.mark.asyncio
async def test_manager_initialises_client(settings: AppSettings) -> None:
    """The manager should instantiate the configured Motor client lazily."""
    manager = MongoClientManager(settings=settings, client_factory=DummyMotorClient)

    async with manager:  # type: ignore[arg-type]
        assert isinstance(manager.client, DummyMotorClient)
        assert manager.client.uri == settings.mongodb_uri


@pytest.mark.asyncio
async def test_manager_closes_client_on_exit(settings: AppSettings) -> None:
    """The manager should close the client when exiting the context."""
    manager = MongoClientManager(settings=settings, client_factory=DummyMotorClient)

    async with manager:  # type: ignore[arg-type]
        client = manager.client
        assert client is not None
        assert not client.closed

    assert client.closed  # type: ignore[union-attr]
