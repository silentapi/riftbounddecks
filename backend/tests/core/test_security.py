"""Unit tests for security helpers such as password hashing and validation."""

from __future__ import annotations

import pytest

from backend.app.core import security


@pytest.mark.parametrize(
    "password",
    ["short", "alllowercase1", "NOLOWERCASE1", "NoDigits"],
)
def test_validate_password_strength_rejects_invalid_passwords(password: str) -> None:
    """The validator should raise ValueError for passwords that violate policy."""

    with pytest.raises(ValueError):
        security.validate_password_strength(password)


def test_validate_password_strength_accepts_valid_password() -> None:
    """Validator returns the original password string when constraints are met."""

    password = "StrongPass1"

    assert security.validate_password_strength(password) == password


def test_hash_password_generates_bcrypt_hash_with_validation() -> None:
    """Hashing should enforce validation and produce bcrypt-compatible digests."""

    hashed_password = security.hash_password("StrongPass1")

    assert hashed_password.startswith("$2")
    assert hashed_password != "StrongPass1"

    with pytest.raises(ValueError):
        security.hash_password("short")


def test_verify_password_checks_hash_match() -> None:
    """Verification should return True for valid hashes and False otherwise."""

    hashed_password = security.hash_password("StrongPass1")

    assert security.verify_password("StrongPass1", hashed_password) is True
    assert security.verify_password("WrongPass1", hashed_password) is False
    assert security.verify_password("StrongPass1", "not-a-hash") is False
