"""The Mongo unread badge: absolute recounts, never breaks mail, Mongo-only reads."""

import pytest

from app.modules.mail import unread_counter as uc


class _Store:
    docs: dict = {}


class _Doc:
    def __init__(self, id, unread=0, updated_at=None):
        self.id, self.unread, self.updated_at = id, unread, updated_at

    @classmethod
    async def get(cls, key):
        return _Store.docs.get(key)

    async def insert(self):
        _Store.docs[self.id] = self

    async def save(self):
        _Store.docs[self.id] = self


class _Txn:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        self.conn.savepoints += 1

    async def __aexit__(self, *exc):
        return False


class _Conn:
    def __init__(self, rows=None, boom=False):
        self.rows, self.boom, self.savepoints, self.calls = rows or [], boom, 0, []

    def transaction(self):
        return _Txn(self)

    async def fetch(self, sql, *args):
        self.calls.append(args)
        if self.boom:
            raise RuntimeError("sql broke")
        return self.rows


@pytest.fixture(autouse=True)
def _store(monkeypatch):
    _Store.docs = {}
    monkeypatch.setattr(uc, "MailUnread", _Doc)


@pytest.mark.asyncio
async def test_missing_total_is_none_then_set_and_overwritten():
    assert await uc.get_total("u1") is None
    await uc.set_total("u1", 4)
    assert await uc.get_total("u1") == 4
    await uc.set_total("u1", 1)  # absolute overwrite, not an increment
    assert await uc.get_total("u1") == 1
    await uc.set_total("u1", -3)
    assert await uc.get_total("u1") == 0


@pytest.mark.asyncio
async def test_refresh_stores_every_affected_member_in_a_savepoint():
    conn = _Conn([{"user_id": "a", "unread": 2}, {"user_id": "b", "unread": 0}])
    assert await uc.refresh_for_mailboxes(conn, ["m1", "m1", "m2"]) == 2
    assert conn.calls == [(["m1", "m2"],)]  # duplicates removed
    assert conn.savepoints == 1
    assert await uc.get_total("a") == 2 and await uc.get_total("b") == 0


@pytest.mark.asyncio
async def test_refresh_failure_is_swallowed_so_mail_keeps_working():
    assert await uc.refresh_for_mailboxes(_Conn(boom=True), ["m1"]) == 0
    assert await uc.refresh_for_mailboxes(_Conn(), []) == 0


@pytest.mark.asyncio
async def test_unreadable_mongo_reads_as_unknown(monkeypatch):
    class _Broken(_Doc):
        @classmethod
        async def get(cls, key):
            raise RuntimeError("mongo down")

    monkeypatch.setattr(uc, "MailUnread", _Broken)
    assert await uc.get_total("u1") is None
    await uc.set_total("u1", 3)  # must not raise


@pytest.mark.asyncio
async def test_nightly_recount():
    class _Pool(_Conn):
        pass

    pool = _Pool([{"user_id": "a", "unread": 9}])
    assert await uc.recompute_all(pool) == 1
    assert await uc.get_total("a") == 9
