"""Tests for FastAPI application factory."""

from __future__ import annotations

import pytest

from backend.app.main import create_app


def test_create_app_returns_fastapi_instance() -> None:
    """The factory should return a configured FastAPI application."""
    app = create_app()

    assert app.title == "Riftbound Deckbuilder API"
    assert "api" in {route.path.split("/")[1] for route in app.routes if hasattr(route, "path")}


@pytest.mark.asyncio
async def test_healthcheck_endpoint(test_client) -> None:
    """The API should expose a simple health endpoint for readiness probes."""
    response = await test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
