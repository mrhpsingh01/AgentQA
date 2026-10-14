"""
AgentQA Security & Cryptography Utilities
Password hashing (Argon2 / PBKDF2), JWT token generation, and API Key hashing.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import jwt
from src.core.config import settings

# Attempt Argon2 hasher via pwdlib, fallback to PBKDF2 if native C extension is unavailable
try:
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher
    _hasher = PasswordHash((Argon2Hasher(),))
    _USE_PWDLIB = True
except Exception:
    _hasher = None
    _USE_PWDLIB = False


def hash_password(password: str) -> str:
    """Securely hashes a plaintext password."""
    if _USE_PWDLIB and _hasher:
        return _hasher.hash(password)
    
    # Safe SHA256 PBKDF2 fallback
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
    return f"pbkdf2:sha256:{salt}:{key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored hash."""
    if hashed_password.startswith("pbkdf2:sha256:"):
        parts = hashed_password.split(":")
        if len(parts) == 4:
            salt = parts[2]
            stored_key = parts[3]
            key = hashlib.pbkdf2_hmac('sha256', plain_password.encode(), salt.encode(), 100_000)
            return hmac.compare_digest(key.hex(), stored_key)

    if _USE_PWDLIB and _hasher:
        try:
            return _hasher.verify(plain_password, hashed_password)
        except Exception:
            return False

    return False


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None, claims: Optional[dict[str, Any]] = None) -> str:
    """Creates a signed short-lived JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "access",
        **(claims or {}),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """Creates a signed long-lived refresh token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decodes and validates a JWT token."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def generate_api_key(prefix: str = "sk_live") -> tuple[str, str]:
    """
    Generates a secure API key pair:
    Returns (raw_key_shown_once, sha256_hash_saved_in_database)
    """
    entropy = secrets.token_urlsafe(32)
    raw_key = f"{prefix}_{entropy}"
    hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed_key


def hash_api_key(raw_key: str) -> str:
    """Hashes a provided raw API key for database lookup."""
    return hashlib.sha256(raw_key.encode()).hexdigest()
