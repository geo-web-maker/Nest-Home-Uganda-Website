#!/usr/bin/env python3
"""Re-encrypt every persisted mail secret before rotating NEST_MAIL_SECRET_KEY.

Run on an owner-controlled host with NEST_PG_URL, NEST_MAIL_SECRET_KEY_OLD and
NEST_MAIL_SECRET_KEY exported. The temporary OLD variable is not a persistent app setting.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from base64 import urlsafe_b64encode

import asyncpg
from cryptography.fernet import Fernet, InvalidToken


def cipher_for(secret: str) -> Fernet:
    key = urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


async def main() -> int:
    database_url = os.getenv("NEST_PG_URL", "")
    old_secret = os.getenv("NEST_MAIL_SECRET_KEY_OLD", "")
    new_secret = os.getenv("NEST_MAIL_SECRET_KEY", "")
    if not all((database_url, old_secret, new_secret)):
        print(
            "NEST_PG_URL, NEST_MAIL_SECRET_KEY_OLD and NEST_MAIL_SECRET_KEY are required.",
            file=sys.stderr,
        )
        return 2
    if old_secret == new_secret:
        print("Old and new mail secret keys are identical; nothing to rotate.", file=sys.stderr)
        return 2

    old_cipher, new_cipher = cipher_for(old_secret), cipher_for(new_secret)
    connection = await asyncpg.connect(
        database_url, command_timeout=60, statement_cache_size=0
    )
    try:
        rows = await connection.fetch(
            "SELECT key, value FROM mail_settings WHERE is_secret = true ORDER BY key"
        )
        replacements: list[tuple[str, str]] = []
        for row in rows:
            raw = row["value"]
            if isinstance(raw, str):
                raw = json.loads(raw)
            encrypted = raw.get("encrypted") if isinstance(raw, dict) else None
            if not isinstance(encrypted, str) or not encrypted.startswith("enc:"):
                raise RuntimeError("A stored secret is malformed; no rows were changed.")
            try:
                plaintext = old_cipher.decrypt(encrypted[4:].encode("ascii"))
            except InvalidToken as exc:
                raise RuntimeError(
                    "A stored secret could not be decrypted with the old key; no rows were changed."
                ) from exc
            replacement = "enc:" + new_cipher.encrypt(plaintext).decode("ascii")
            replacements.append((row["key"], json.dumps({"encrypted": replacement})))

        async with connection.transaction():
            for key, value in replacements:
                await connection.execute(
                    "UPDATE mail_settings SET value = $2::jsonb, updated_at = now() WHERE key = $1",
                    key,
                    value,
                )
                await connection.execute(
                    "INSERT INTO mail_audit (action, detail) "
                    "VALUES ('mail.secret.rotate', $1::jsonb)",
                    json.dumps({"key": key, "rotated": True}),
                )
        print(f"Re-encrypted {len(replacements)} mail secret setting(s). No values were displayed.")
        return 0
    finally:
        await connection.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
