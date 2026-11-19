"""Mongo markers that say when a Neon-backed job next needs the database.

Polling jobs read their marker (Mongo, free) before opening a Neon connection, so an idle
database can autosuspend. Markers are written by code that already has Neon awake (the end of
a drain) or when work is queued (mark_due). When a marker is missing or unreadable the job
runs anyway, so a Mongo problem can only cost extra wakes, never lost work.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta

from beanie import Document

log = logging.getLogger("app.wake_state")

UNKNOWN_RETRY_SECONDS = 600  # while a marker is unreadable, still check Neon at most this often
DEFAULT_SAFETY_NET = timedelta(hours=6)  # longest an idle job goes without one real check

_checked_this_boot: set[str] = set()
_last_unknown_run: dict[str, float] = {}


class WakeState(Document):
    id: str  # the job key, e.g. "mail_outbox"
    next_due: datetime | None = None  # None means nothing is pending
    updated_at: datetime | None = None  # when a real Neon check last recorded this

    class Settings:
        name = "wake_state"


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _unknown(key: str) -> bool:
    now = time.monotonic()
    last = _last_unknown_run.get(key)
    if last is not None and now - last < UNKNOWN_RETRY_SECONDS:
        return False
    _last_unknown_run[key] = now
    return True


async def _find(key: str) -> WakeState | None:
    return await WakeState.find_one(WakeState.id == key)


async def should_run(key: str, safety_net: timedelta = DEFAULT_SAFETY_NET, now: datetime | None = None) -> bool:
    """True when the job should really query Neon on this tick."""
    now = now or datetime.now(UTC)
    if key not in _checked_this_boot:
        _checked_this_boot.add(key)
        return True  # one real check per process start, in case a crash left work behind
    try:
        state = await _find(key)
    except Exception:
        log.warning("wake marker %s unreadable; details omitted", key)
        return _unknown(key)
    if state is None:
        return _unknown(key)
    if state.updated_at is not None and now - _aware(state.updated_at) >= safety_net:
        return True  # safety net for any enqueue path that forgot to call mark_due
    if state.next_due is None:
        return False
    return _aware(state.next_due) <= now


async def set_next_due(key: str, when: datetime | None) -> None:
    """Record the earliest time the job needs Neon again (None = nothing pending)."""
    try:
        await WakeState(id=key, next_due=when, updated_at=datetime.now(UTC)).save()
    except Exception:
        log.warning("wake marker %s not written; details omitted", key)


async def mark_due(key: str) -> None:
    """Work was just queued: make the next poll tick pick it up."""
    try:
        existing = await _find(key)
        updated = existing.updated_at if existing else None
        await WakeState(id=key, next_due=datetime.now(UTC), updated_at=updated).save()
    except Exception:
        log.warning("wake marker %s not marked due; details omitted", key)
