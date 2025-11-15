"""Application configuration utilities.

This module centralises environment-driven configuration for the backend. The
:class:`AppSettings` object is designed for dependency injection and can be
cached so expensive environment parsing happens once per process.
"""

from __future__ import annotations

from functools import lru_cache
import secrets
from typing import Final

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DATABASE_URI: Final[str] = "mongodb://localhost:27017/riftbound"
DEFAULT_JWT_EXPIRY_SECONDS: Final[int] = 60 * 60 * 24  # 24 hours
DEFAULT_LOG_LEVEL: Final[str] = "INFO"


class AppSettings(BaseSettings):
    """Concrete settings class for the Riftbound backend.

    Values are sourced from environment variables but carry sensible defaults
    for local development. Strict validation is applied to ensure critical
    settings like the MongoDB URI and JWT secret are present.
    """

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False, populate_by_name=True)

    app_name: str = Field("Riftbound Deckbuilder API", alias="APP_NAME")
    debug: bool = Field(False, alias="DEBUG")
    mongodb_uri: str = Field(DEFAULT_DATABASE_URI, alias="MONGODB_URI")
    jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(32), alias="JWT_SECRET")
    jwt_expires_in: int = Field(DEFAULT_JWT_EXPIRY_SECONDS, alias="JWT_EXPIRES_IN", ge=60)
    log_level: str = Field(DEFAULT_LOG_LEVEL, alias="LOG_LEVEL")

    @field_validator("mongodb_uri")
    @classmethod
    def validate_mongodb_uri(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("MONGODB_URI must not be empty")
        return value

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if not value or len(value) < 16:
            raise ValueError("JWT_SECRET must be at least 16 characters long")
        return value


@lru_cache()
def get_settings() -> AppSettings:
    """Return the cached application settings instance."""

    return AppSettings()
