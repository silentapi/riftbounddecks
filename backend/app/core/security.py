"""Security utilities for password hashing and validation policies."""

from __future__ import annotations

import re
from typing import Final

from passlib.context import CryptContext

# Reusable bcrypt context configured per passlib best practices.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Compiled regular expressions allow fast repeated validation checks.
_LOWERCASE_RE: Final[re.Pattern[str]] = re.compile(r"[a-z]")
_UPPERCASE_RE: Final[re.Pattern[str]] = re.compile(r"[A-Z]")
_DIGIT_RE: Final[re.Pattern[str]] = re.compile(r"\d")

PASSWORD_MIN_LENGTH: Final[int] = 8


def validate_password_strength(password: str) -> str:
    """Validate that a plaintext password satisfies policy requirements."""

    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError("password must contain at least 8 characters")

    if not _LOWERCASE_RE.search(password):
        raise ValueError("password must include a lowercase letter")

    if not _UPPERCASE_RE.search(password):
        raise ValueError("password must include an uppercase letter")

    if not _DIGIT_RE.search(password):
        raise ValueError("password must include a digit")

    return password


def hash_password(password: str) -> str:
    """Hash the provided password using bcrypt after enforcing validation."""

    validated_password = validate_password_strength(password)
    return _pwd_context.hash(validated_password)


def verify_password(password: str, password_hash: str) -> bool:
    """Return ``True`` when ``password`` corresponds to ``password_hash``."""

    if not password_hash:
        return False

    try:
        return _pwd_context.verify(password, password_hash)
    except (ValueError, TypeError):
        # Passlib raises ValueError when the hash is invalid/malformed.
        return False


__all__ = ["hash_password", "verify_password", "validate_password_strength", "PASSWORD_MIN_LENGTH"]
