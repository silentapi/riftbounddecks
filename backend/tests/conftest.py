"""Global pytest fixtures for backend tests."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app


@pytest.fixture(scope="session")
def event_loop() -> AsyncIterator[asyncio.AbstractEventLoop]:
    """Create an event loop for the test session.

    Pytest-asyncio requires a session-scoped event loop when using the
    ``asyncio`` marker style (default). This fixture provides that loop and
    ensures it is properly closed after the test session completes.
    """

    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_client() -> AsyncIterator[AsyncClient]:
    """Provide an HTTPX async client bound to the FastAPI app.

    This gives tests a simple way to interact with the API without starting a
    real ASGI server. The client automatically handles lifespan events so
    startup/shutdown logic is executed for each test.
    """

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
