"""MongoDB client management helpers."""

from __future__ import annotations

from typing import Callable, Optional, Protocol, TypeVar

from motor.motor_asyncio import AsyncIOMotorClient

from backend.app.core.config import AppSettings


TClient = TypeVar("TClient", bound=AsyncIOMotorClient)


class ClientFactory(Protocol):
    """Protocol representing the Motor client constructor."""

    def __call__(self, uri: str) -> AsyncIOMotorClient:  # pragma: no cover - interface definition
        ...


class MongoClientManager:
    """Asynchronous context manager that handles the Motor client lifecycle."""

    def __init__(
        self,
        *,
        settings: AppSettings,
        client_factory: ClientFactory | Callable[[str], TClient] = AsyncIOMotorClient,
    ) -> None:
        self._settings = settings
        self._client_factory: ClientFactory | Callable[[str], TClient] = client_factory
        self.client: Optional[AsyncIOMotorClient] = None

    async def __aenter__(self) -> AsyncIOMotorClient:
        if self.client is None:
            self.client = self._client_factory(self._settings.mongodb_uri)
        return self.client

    async def __aexit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        if self.client is not None:
            self.client.close()
            self.client = None


def get_client_manager(settings: AppSettings) -> MongoClientManager:
    """Convenience factory for dependency injection."""

    return MongoClientManager(settings=settings)
