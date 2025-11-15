"""FastAPI application factory for the Riftbound backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI

from backend.app.core.config import AppSettings, get_settings
from backend.app.db.client import get_client_manager


api_router = APIRouter(prefix="/api", tags=["core"])


@api_router.get("/ping", summary="API liveness check")
async def ping() -> dict[str, str]:
    """Simple endpoint used during initial scaffolding and testing."""

    return {"status": "pong"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown tasks.

    The MongoDB client manager is initialised lazily and stored on the
    application state for later use by request handlers.
    """

    settings = get_settings()
    client_manager = get_client_manager(settings)
    async with client_manager as client:
        app.state.mongodb_client = client
        yield
    app.state.mongodb_client = None  # type: ignore[attr-defined]


def create_app(settings: AppSettings | None = None) -> FastAPI:
    """Build and configure the FastAPI application instance."""

    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    @app.get("/health", tags=["health"], summary="Service healthcheck")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api_router)

    return app


app = create_app()
