"""Outbox kick, slow poll, authenticator cookie import and shared-mailbox listing. Written, not run here."""
import asyncio
import inspect
from contextlib import asynccontextmanager

from app import jobs
from app.core.deps import Principal
from app.modules.mail import outbox, router


async def test_kick_runs_one_drain_for_many_calls(monkeypatch):
    calls = []

    async def fake_drain(limit=20):
        calls.append(1)
        return 0

    monkeypatch.setattr(outbox, "drain", fake_drain)
    monkeypatch.setattr(outbox, "_kick_handle", None)
    assert outbox.kick(delay=0.01) is True
    assert outbox.kick(delay=0.01) is False  # merged with the pending one
    await asyncio.sleep(0.1)
    assert calls == [1]
    assert outbox.kick(delay=0.01) is True  # a later send schedules a new drain
    await asyncio.sleep(0.1)
    assert calls == [1, 1]


def test_kick_without_event_loop_is_a_noop():
    assert outbox.kick() is False


async def test_kick_swallows_drain_errors(monkeypatch):
    async def boom(limit=20):
        raise RuntimeError("db down")

    monkeypatch.setattr(outbox, "drain", boom)
    assert await outbox._safe_drain() == 0


def test_outbox_poll_is_slow_enough_for_neon_to_sleep():
    source = inspect.getsource(jobs)
    assert 'id="mail_outbox_drain"' in source
    line = next(item for item in source.splitlines() if 'id="mail_outbox_drain"' in item)
    assert "minutes=5" in line and "seconds=15" not in line


def test_authenticator_cookie_uses_the_multi_site_module_path():
    source = inspect.getsource(router.totp_verify)
    assert "app.modules.mail.settings_service" in source
    assert "app.modules.mail.settings_service" in source and "projects.nest" not in source


class _Conn:
    def __init__(self, boxes, members):
        self.boxes, self.members = boxes, members

    async def fetch(self, sql, *args):
        return self.boxes if "FROM mailbox WHERE" in sql else self.members


class _Pool:
    def __init__(self, conn):
        self.conn = conn

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


async def test_list_shared_groups_members_and_hides_no_reply_filter_in_sql(monkeypatch):
    boxes = [{"id": "b1", "local_part": "info", "display_name": "Info desk"}]
    members = [{"mailbox_id": "b1", "user_id": "u1", "role": "owner"}, {"mailbox_id": "b1", "user_id": "u2", "role": "send_as"}]
    monkeypatch.setattr(router.mail_db, "get_pool", lambda: _Pool(_Conn(boxes, members)))

    async def no_totp(*args, **kwargs):
        return None

    async def value(key, **kwargs):
        return "bhcug.com"

    monkeypatch.setattr(router, "_require_sensitive_totp", no_totp)
    monkeypatch.setattr("app.modules.mail.settings_service.get_value", value)
    result = await router.list_shared(principal=Principal.__new__(Principal), mail_totp=None)
    assert result["items"] == [
        {
            "id": "b1",
            "local_part": "info",
            "address": "info@bhcug.com",
            "display_name": "Info desk",
            "members": [{"user_id": "u1", "role": "owner"}, {"user_id": "u2", "role": "send_as"}],
        }
    ]
    assert "local_part<>'no-reply'" in inspect.getsource(router.list_shared)


def test_totp_reset_route_requires_a_proven_code_and_clears_the_cookie():
    source = inspect.getsource(router.totp_reset)
    assert "verify_code_or_recovery" in source
    assert "DELETE FROM totp_secret WHERE user_id=$1" in source
    assert 'delete_cookie("mail_totp"' in source
