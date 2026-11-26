"""Cryptographic services: Argon2id password hashing and Fernet token encryption."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from ..core.config import settings

# Initialize Argon2id password hasher with recommended parameters
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        return _ph.verify(hashed, password)
    except (VerifyMismatchError, Exception):
        return False


def _get_fernet() -> Fernet:
    """Ensure a valid 32-byte urlsafe base64 key is used for Fernet."""
    raw_key = settings.ENCRYPTION_MASTER_KEY
    try:
        # Check if already a valid Fernet key
        return Fernet(raw_key.encode("utf-8"))
    except Exception:
        # Deterministically derive 32 bytes using SHA-256 and base64-encode
        derived = base64.urlsafe_b64encode(hashlib.sha256(raw_key.encode("utf-8")).digest())
        return Fernet(derived)


def encrypt_token(token: str) -> str:
    """Encrypt an access or refresh token string using AES/Fernet."""
    if not token:
        return ""
    f = _get_fernet()
    return f.encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(encrypted_token: str) -> str:
    """Decrypt an encrypted token back into plaintext."""
    if not encrypted_token:
        return ""
    f = _get_fernet()
    try:
        return f.decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Decryption failed: Token is corrupted or master key has changed.")


def generate_secure_token(nbytes: int = 32) -> str:
    """Generate a cryptographically strong random token."""
    return secrets.token_urlsafe(nbytes)


def create_signed_state(payload: str, secret: str = settings.SESSION_SECRET) -> str:
    """Create a signed state string with timestamp to prevent CSRF and replay."""
    timestamp = str(int(time.time()))
    data = f"{payload}:{timestamp}"
    sig = hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{data}:{sig}"


def verify_signed_state(signed_state: str, max_age_seconds: int = 600, secret: str = settings.SESSION_SECRET) -> Optional[str]:
    """Verify signed state signature and expiry (default 10 min)."""
    try:
        parts = signed_state.split(":")
        if len(parts) != 3:
            return None
        payload, timestamp_str, sig = parts
        data = f"{payload}:{timestamp_str}"
        expected_sig = hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        created_time = int(timestamp_str)
        if time.time() - created_time > max_age_seconds:
            return None
        return payload
    except Exception:
        return None
