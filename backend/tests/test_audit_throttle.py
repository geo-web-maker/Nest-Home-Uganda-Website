"""The 4xx throttle uses MongoDB only: first hit per minute is sampled, the rest are not."""

import pytest
from pymongo.errors import DuplicateKeyError

from app.core import audit_throttle


class _Doc:
    seen: set = set()

    def __init__(self, id, expires_at):
        self.id = id

    async def insert(self):
        if self.id in _Doc.seen:
            raise DuplicateKeyError("dup")
        _Doc.seen.add(self.id)


@pytest.mark.asyncio
async def test_first_in_window_then_duplicates(monkeypatch):
    _Doc.seen = set()
    monkeypatch.setattr(audit_throttle, "AuditThrottle", _Doc)
    assert await audit_throttle.first_in_window("k", now=120.0) is True
    assert await audit_throttle.first_in_window("k", now=150.0) is False  # same minute
    assert await audit_throttle.first_in_window("k", now=181.0) is True   # next minute
