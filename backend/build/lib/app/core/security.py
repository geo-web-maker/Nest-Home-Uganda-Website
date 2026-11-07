"""Password hashing, JWT access tokens, opaque tokens, IP hashing (spec 9.7)."""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()  # Argon2id by default
_JWT_ALG = "HS256"
_MIN_SECRET_LENGTH = 32


class TokenError(Exception):
    """The access token is missing, malformed, expired or not ours."""


@dataclass(frozen=True)
class AccessClaims:
    user_id: str
    scopes: frozenset[str]
    is_superadmin: bool


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# Verified when the email is unknown, so timing does not reveal which emails exist.
DUMMY_PASSWORD_HASH = _hasher.hash("not-a-real-password")


def _secret() -> str:
    secret = get_settings().secret_key
    if len(secret) < _MIN_SECRET_LENGTH:
        raise RuntimeError("SECRET_KEY must be set and at least 32 characters long.")
    return secret


def create_access_token(
    user_id: str, scopes: list[str], is_superadmin: bool, now: datetime | None = None
) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    issued = now or datetime.now(UTC)
    minutes = get_settings().access_token_minutes
    payload = {
        "sub": user_id,
        "typ": "access",
        "scopes": sorted(scopes),
        "sa": is_superadmin,
        "iat": issued,
        "exp": issued + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, _secret(), algorithm=_JWT_ALG), minutes * 60


def decode_access_token(token: str) -> AccessClaims:
    try:
        data = jwt.decode(
            token,
            _secret(),
            algorithms=[_JWT_ALG],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError("invalid token") from exc
    if data.get("typ") != "access" or not isinstance(data.get("scopes"), list):
        raise TokenError("wrong token type")
    return AccessClaims(
        user_id=str(data["sub"]),
        scopes=frozenset(str(s) for s in data["scopes"]),
        is_superadmin=bool(data.get("sa", False)),
    )


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def hash_ip(ip: str) -> str:
    """Salted hash. The raw IP is never stored."""
    salt = get_settings().ip_hash_salt or _secret()
    return hmac.new(salt.encode(), ip.encode(), hashlib.sha256).hexdigest()
