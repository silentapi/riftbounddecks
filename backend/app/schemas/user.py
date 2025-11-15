"""Pydantic schemas exposed via public authentication endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.app.core.security import validate_password_strength
from backend.app.models.user import ObjectIdStr, validate_username


class UserPublic(BaseModel):
    """User data returned to authenticated clients."""

    id: ObjectIdStr = Field(alias="_id")
    username: str
    email: EmailStr
    date_created: datetime = Field(alias="dateCreated")
    last_updated: datetime = Field(alias="lastUpdated")

    model_config = {
        "populate_by_name": True,
        "str_strip_whitespace": True,
    }

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        return validate_username(value)


class UserCreate(BaseModel):
    """Payload accepted when registering a new account."""

    username: str
    email: EmailStr
    password: str

    model_config = {
        "str_strip_whitespace": True,
    }

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        return validate_username(value)

    @field_validator("password")
    @classmethod
    def _validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


__all__ = ["UserPublic", "UserCreate"]
