"""Tests for configuration loading utilities."""

from __future__ import annotations

from typing import Dict

import pytest

from backend.app.core.config import AppSettings, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset cached settings between tests."""
    monkeypatch.delenv("RIFTBOUND_SETTINGS_CACHE", raising=False)
    # Force re-evaluation by clearing function cache attribute if present.
    get_settings.cache_clear()


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> Dict[str, str]:
    """Provide mutable environment variables for tests."""
    data = {
        "MONGODB_URI": "mongodb://unit-test:27017",
        "JWT_SECRET": "super-secret-value",
        "JWT_EXPIRES_IN": "3600",
        "LOG_LEVEL": "DEBUG",
    }
    for key, value in data.items():
        monkeypatch.setenv(key, value)
    return data


def test_settings_load_from_environment(env: Dict[str, str]) -> None:
    """Settings should reflect values read from environment variables."""
    settings = get_settings()

    assert settings.mongodb_uri == env["MONGODB_URI"]
    assert settings.jwt_secret == env["JWT_SECRET"]
    assert settings.jwt_expires_in == int(env["JWT_EXPIRES_IN"])
    assert settings.log_level == env["LOG_LEVEL"]


def test_settings_have_sensible_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """When optional env vars missing, defaults should be applied."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("JWT_EXPIRES_IN", raising=False)
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    settings = get_settings()

    assert settings.mongodb_uri == "mongodb://localhost:27017/riftbound"
    assert settings.jwt_secret is not None and len(settings.jwt_secret) >= 32
    assert settings.jwt_expires_in == 86400
    assert settings.log_level == "INFO"


def test_settings_validate_required_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    """An explicit error is raised when required configuration is missing."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.setenv("JWT_SECRET", "")

    with pytest.raises(ValueError):
        AppSettings(jwt_secret="", mongodb_uri="", jwt_expires_in=3600)  # type: ignore[arg-type]
