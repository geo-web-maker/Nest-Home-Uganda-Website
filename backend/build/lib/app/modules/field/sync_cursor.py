"""Opaque, stable cursors for incremental nurse schedule pulls."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import TypeAlias

Cursor: TypeAlias = tuple[datetime, str]  # noqa: UP040


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def encode_cursor(updated_at: datetime, key: str) -> str:
    """Encode the last processed (updated_at, stable key) pair as an opaque cursor."""
    if len(key) > 512 or not (key.startswith("visit:") or key.startswith("zremoved:")):
        raise ValueError("Cursor key is invalid")
    payload = {"updated_at": _as_utc(updated_at).isoformat(), "key": key}
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(value: str | None) -> Cursor | None:
    """Return None for an empty, malformed, or unsupported cursor."""
    if not value or len(value) > 2048:
        return None
    try:
        padded = value + ("=" * (-len(value) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
        updated_at = datetime.fromisoformat(payload["updated_at"])
        key = payload["key"]
        if (
            not isinstance(key, str)
            or len(key) > 512
            or not (key.startswith("visit:") or key.startswith("zremoved:"))
        ):
            return None
        return (_as_utc(updated_at), key)
    except Exception:
        # Cursors are untrusted query input; malformed encodings start a fresh pull.
        return None


def is_after_cursor(updated_at: datetime, key: str, cursor: Cursor | None) -> bool:
    if cursor is None:
        return True
    return (_as_utc(updated_at), key) > cursor
