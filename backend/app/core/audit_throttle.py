"""Cross-worker 4xx audit throttle kept in MongoDB, so API errors never wake Neon.

One document per route/status/IP/minute. The first insert in a minute wins (returns True);
a duplicate key means it was already sampled. A TTL index removes old documents, so there is
no read and no cleanup query.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from beanie import Document
from pymongo import IndexModel
from pymongo.errors import DuplicateKeyError

WINDOW_SECONDS = 60


class AuditThrottle(Document):
    id: str  # "<hash>:<minute number>"
    expires_at: datetime

    class Settings:
        name = "audit_throttle"
        indexes = [IndexModel([("expires_at", 1)], expireAfterSeconds=0)]


async def first_in_window(key: str, now: float | None = None) -> bool:
    """True the first time this key is seen in the current minute, across all workers."""
    minute = int((now if now is not None else time.time()) // WINDOW_SECONDS)
    expires = datetime.now(UTC) + timedelta(seconds=WINDOW_SECONDS * 2)
    try:
        await AuditThrottle(id=f"{key}:{minute}", expires_at=expires).insert()
    except DuplicateKeyError:
        return False
    return True
