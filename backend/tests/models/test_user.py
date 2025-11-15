"""Unit tests for backend.app.models.user module."""

from __future__ import annotations

from datetime import datetime

import pytest
from bson import ObjectId
from pydantic import ValidationError

from backend.app.models.user import UserDocument


def _sample_user_payload(**overrides: object) -> dict[str, object]:
    """Utility helper returning a valid user document payload for testing."""

    payload: dict[str, object] = {
        "_id": str(ObjectId()),
        "username": "test_user",
        "email": "user@example.com",
        "password_hash": "bcrypt$hash",
        "dateCreated": datetime(2024, 1, 1, 12, 0, 0),
        "lastUpdated": datetime(2024, 1, 2, 12, 0, 0),
    }
    payload.update(overrides)
    return payload


def test_user_document_accepts_valid_payload() -> None:
    """Ensure the document model accepts a fully valid payload."""

    payload = _sample_user_payload()

    document = UserDocument.model_validate(payload)

    assert document.id == payload["_id"]
    assert document.username == payload["username"]
    assert document.email == payload["email"]
    assert document.password_hash == payload["password_hash"]


@pytest.mark.parametrize(
    "username",
    [
        "ab",  # shorter than minimum of 3 characters
        "user@name",  # contains invalid characters
        "a" * 51,  # exceeds 50 characters
    ],
)
def test_user_document_rejects_invalid_usernames(username: str) -> None:
    """Invalid usernames should raise validation errors."""

    payload = _sample_user_payload(username=username)

    with pytest.raises(ValidationError):
        UserDocument.model_validate(payload)


def test_user_document_rejects_invalid_email_format() -> None:
    """Ensure email addresses must be valid per RFC 5322 basic validation."""

    payload = _sample_user_payload(email="not-an-email")

    with pytest.raises(ValidationError):
        UserDocument.model_validate(payload)


def test_user_document_supports_objectid_instances() -> None:
    """Model should coerce raw ``ObjectId`` inputs to strings for stability."""

    object_id = ObjectId()
    payload = _sample_user_payload(_id=object_id)

    document = UserDocument.model_validate(payload)

    assert document.id == str(object_id)
