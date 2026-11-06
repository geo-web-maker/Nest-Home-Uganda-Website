# ruff: noqa: E501,E701,E702
"""RFC 6238 TOTP, high-entropy recovery codes and database-backed enrollment state."""
import base64
import hashlib
import hmac
import secrets
import struct
import time

from app.modules.mail.settings_service import encrypt_secret, decrypt_secret
from app.modules.mail import db


def _recovery_digest(value: str) -> str:
    from app.core.config import get_settings
    cfg = get_settings()
    pepper = cfg.nest_mail_secret_key or cfg.secret_key
    if len(pepper) < 32:
        raise RuntimeError("A strong application/mail secret is required for recovery-code hashing.")
    return "v1:" + hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def code(secret: str, at: int | None = None) -> str:
    counter = int((at if at is not None else time.time()) // 30)
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()  # noqa: S324 - RFC 6238
    offset = digest[-1] & 15
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000
    return f"{value:06d}"


def verify(secret: str, supplied: str) -> bool:
    return any(hmac.compare_digest(code(secret, int(time.time()) + shift * 30), supplied) for shift in (-1, 0, 1))


async def enrol(user_id: str):
    secret = new_secret()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO totp_secret(user_id,secret_encrypted,confirmed_at,recovery_hashes) "
            "VALUES($1,$2,NULL,'{}') ON CONFLICT(user_id) DO UPDATE SET "
            "secret_encrypted=EXCLUDED.secret_encrypted,confirmed_at=NULL,recovery_hashes='{}'",
            user_id, encrypt_secret(secret).encode(),
        )
    return secret


async def confirm(user_id: str, supplied: str):
    pool = db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT secret_encrypted FROM totp_secret WHERE user_id=$1", user_id)
        if not row:
            return False
        secret = decrypt_secret(bytes(row["secret_encrypted"]).decode())
        if not verify(secret, supplied):
            return False
        recovery = [secrets.token_hex(16) for _ in range(8)]  # 128-bit, one-time codes
        hashes = [_recovery_digest(value) for value in recovery]
        await conn.execute(
            "UPDATE totp_secret SET confirmed_at=now(),recovery_hashes=$2 WHERE user_id=$1",
            user_id, hashes,
        )
        return recovery


async def verified(user_id: str):
    pool = db.get_pool()
    async with pool.acquire() as conn:
        return bool(await conn.fetchval("SELECT confirmed_at IS NOT NULL FROM totp_secret WHERE user_id=$1", user_id))


async def enrollment_epoch(user_id: str) -> int | None:
    """Microsecond epoch of the current enrollment; changes on reset/re-confirm."""
    pool = db.get_pool()
    async with pool.acquire() as conn:
        value = await conn.fetchval("SELECT confirmed_at FROM totp_secret WHERE user_id=$1", user_id)
    return int(value.timestamp() * 1_000_000) if value else None


async def verify_code_or_recovery(user_id: str, supplied: str) -> bool:
    """Verify TOTP or atomically consume a single-use recovery code.

    Legacy SHA-256 recovery hashes are accepted once during migration; all newly
    issued codes are 128-bit and keyed-HMAC hashed at rest.
    """
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT secret_encrypted,confirmed_at,recovery_hashes FROM totp_secret WHERE user_id=$1 FOR UPDATE",
                user_id,
            )
            if not row or not row["confirmed_at"]:
                return False
            secret = decrypt_secret(bytes(row["secret_encrypted"]).decode())
            if verify(secret, supplied):
                return True
            hashes = list(row["recovery_hashes"] or [])
            digest = _recovery_digest(supplied)
            legacy = hashlib.sha256(supplied.encode()).hexdigest()
            matched = digest if digest in hashes else (legacy if legacy in hashes else None)
            if matched is None:
                return False
            hashes.remove(matched)
            await conn.execute("UPDATE totp_secret SET recovery_hashes=$2 WHERE user_id=$1", user_id, hashes)
            return True
