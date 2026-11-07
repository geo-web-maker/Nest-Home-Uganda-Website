"""Outbox kick, slow poll, authenticator cookie import and shared-mailbox listing. Written, not run here."""
import asyncio
import inspect
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

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
    assert "app.core.config" in source
    assert "projects.nest" not in source


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

    async def users(ids):
        return {"u1": SimpleNamespace(name="Amina", email="amina@bhcug.com", is_active=True)}

    async def people():
        return [{"id": "u1", "name": "Amina", "email": "amina@bhcug.com"}]

    monkeypatch.setattr(router, "_require_sensitive_totp", no_totp)
    monkeypatch.setattr("app.modules.mail.settings_service.get_value", value)
    monkeypatch.setattr("app.modules.mail.mailbox_admin._users_by_id", users)
    monkeypatch.setattr("app.modules.mail.mailbox_admin.assignable_people", people)
    result = await router.list_shared(principal=Principal.__new__(Principal), mail_totp=None)
    assert result["assignable_users"] == [{"id": "u1", "name": "Amina", "email": "amina@bhcug.com"}]
    assert result["items"] == [
        {
            "id": "b1",
            "local_part": "info",
            "address": "info@bhcug.com",
            "display_name": "Info desk",
            "members": [
                {"user_id": "u1", "role": "owner", "name": "Amina", "email": "amina@bhcug.com", "is_active": True, "missing": False},
                # u2 no longer exists: it is flagged, never dropped or shown as a bare id.
                {"user_id": "u2", "role": "send_as", "name": None, "email": None, "is_active": False, "missing": True},
            ],
        }
    ]
    assert "local_part<>'no-reply'" in inspect.getsource(router.list_shared)


def test_totp_reset_route_requires_a_proven_code_and_clears_the_cookie():
    source = inspect.getsource(router.totp_reset)
    assert "verify_code_or_recovery" in source
    assert "DELETE FROM totp_secret WHERE user_id=$1" in source
    assert 'delete_cookie("mail_totp"' in source


# ---- shared mailbox hardening: bad ids and vanished users give clear 4xx errors, not 500s ----
from app.core.errors import Conflict, Forbidden, NotFound  # noqa: E402
from app.modules.mail import mailbox_admin  # noqa: E402


def test_malformed_mailbox_id_is_not_found_not_a_database_error():
    with pytest.raises(NotFound):
        mailbox_admin._uuid("not-a-uuid")
    assert mailbox_admin._uuid("123e4567-e89b-12d3-a456-426614174000") == "123e4567-e89b-12d3-a456-426614174000"


def test_role_must_be_known():
    assert mailbox_admin._role("send_as") == "send_as"
    with pytest.raises(Conflict):
        mailbox_admin._role("admin")


def test_describe_members_flags_users_that_no_longer_exist():
    users = {"u1": SimpleNamespace(name="Amina", email="a@x.com", is_active=True)}
    out = mailbox_admin.describe_members([{"user_id": "u1", "role": "owner"}, {"user_id": "gone", "role": "read_only"}], users)
    assert out[0]["missing"] is False and out[0]["name"] == "Amina"
    assert out[1]["missing"] is True and out[1]["name"] is None


async def test_assign_refuses_a_user_that_no_longer_exists(monkeypatch):
    async def none(ids):
        return {}

    monkeypatch.setattr(mailbox_admin, "_users_by_id", none)
    with pytest.raises(NotFound):
        await mailbox_admin.assign_member("admin", "123e4567-e89b-12d3-a456-426614174000", "6aedd653155add4646050cb6", "send_as")


async def test_assign_refuses_an_inactive_user(monkeypatch):
    async def inactive(ids):
        return {"u1": SimpleNamespace(name="Amina", email="a@x.com", is_active=False)}

    monkeypatch.setattr(mailbox_admin, "_users_by_id", inactive)
    with pytest.raises(Conflict):
        await mailbox_admin.assign_member("admin", "123e4567-e89b-12d3-a456-426614174000", "u1", "owner")


async def test_unassign_and_close_reject_malformed_mailbox_ids():
    with pytest.raises(NotFound):
        await mailbox_admin.unassign_member("admin", "oops", "u1")
    with pytest.raises(NotFound):
        await mailbox_admin.close_shared("admin", "oops")


async def test_create_shared_rejects_reserved_and_invalid_names():
    with pytest.raises(Forbidden):
        await mailbox_admin.create_shared("admin", "no-reply", "No reply")
    with pytest.raises(Conflict):
        await mailbox_admin.create_shared("admin", "!!!", "Bad")


def test_deleting_a_user_clears_every_shared_membership():
    source = inspect.getsource(mailbox_admin.release_user_mailboxes)
    assert "kind='shared'" in source
