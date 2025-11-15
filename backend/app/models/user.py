"""Data models describing how user documents are stored in MongoDB."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any

from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field, field_validator
from pydantic.functional_validators import BeforeValidator

ObjectIdStr = Annotated[
    str,
    BeforeValidator(
        lambda value: str(value)
        if isinstance(value, ObjectId)
        else value,
    ),
]


def validate_username(username: str) -> str:
    """Validate a username according to API contract constraints."""

    if not 3 <= len(username) <= 50:
        raise ValueError("username must be between 3 and 50 characters long")

    if not re.fullmatch(r"[A-Za-z0-9_]+", username):
        raise ValueError("username may only contain letters, numbers, and underscores")

    return username


def validate_password_hash(password_hash: str) -> str:
    """Ensure hashed passwords are not empty to avoid accidental plaintext storage."""

    if not password_hash:
        raise ValueError("password hash cannot be empty")

    return password_hash


class UserDocument(BaseModel):
    """Representation of a stored user document."""

    id: ObjectIdStr = Field(alias="_id")
    username: str
    email: EmailStr
    password_hash: str
    date_created: datetime = Field(alias="dateCreated")
    last_updated: datetime = Field(alias="lastUpdated")

    model_config = {
        "populate_by_name": True,
        "str_strip_whitespace": True,
        "extra": "ignore",
    }

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        return validate_username(value)

    @field_validator("password_hash")
    @classmethod
    def _validate_password_hash(cls, value: str) -> str:
        return validate_password_hash(value)

    @field_validator("id")
    @classmethod
    def _validate_object_id(cls, value: str) -> str:
        if not ObjectId.is_valid(value):
            raise ValueError("_id must be a valid ObjectId string")
        return value

    def to_public_dict(self) -> dict[str, Any]:
        """Return a dictionary safe for public API responses."""

        return {
            "_id": self.id,
            "username": self.username,
            "email": self.email,
            "dateCreated": self.date_created,
            "lastUpdated": self.last_updated,
        }


__all__ = ["UserDocument", "validate_username", "validate_password_hash"]
