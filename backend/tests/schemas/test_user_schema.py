"""Unit tests validating backend.app.schemas.user models."""

from __future__ import annotations

from datetime import datetime

import pytest
from bson import ObjectId
from pydantic import ValidationError

from backend.app.schemas.user import UserCreate, UserPublic


def test_user_public_drops_sensitive_fields() -> None:
    """Ensure public schema excludes password hash information."""

    payload = {
        "_id": str(ObjectId()),
        "username": "deckmaster",
        "email": "deckmaster@example.com",
        "dateCreated": datetime(2024, 1, 1, 12, 0, 0),
        "lastUpdated": datetime(2024, 1, 2, 12, 0, 0),
    }

    user_public = UserPublic.model_validate(payload)

    dumped = user_public.model_dump(by_alias=True)
    assert "password_hash" not in dumped
    assert dumped["_id"] == payload["_id"]


@pytest.mark.parametrize(
    "password",
    [
        "short",
        "alllowercase1",
        "NOLOWERCASE1",
        "NoDigits",
    ],
)
def test_user_create_enforces_password_rules(password: str) -> None:
    """Registration schema should enforce minimal password complexity."""

    with pytest.raises(ValidationError):
        UserCreate.model_validate(
            {
                "username": "valid_user",
                "email": "valid@example.com",
                "password": password,
            }
        )


def test_user_create_accepts_strong_password() -> None:
    """Valid password passes complexity validators."""

    payload = {
        "username": "strong_user",
        "email": "strong@example.com",
        "password": "StrongPass1",
    }

    user_create = UserCreate.model_validate(payload)

    assert user_create.password == payload["password"]
