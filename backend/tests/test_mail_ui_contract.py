# ruff: noqa: E501
"""Backend facts the mail screens rely on. No database: the pool is a small fake."""

import inspect

import pytest

from app.modules.mail import core_service


def test_message_list_folder_is_validated_so_a_bad_folder_is_a_422_not_a_500():
    from app.modules.mail.router import messages

    default = inspect.signature(messages).parameters["folder"].default
    assert "inbox|sent|drafts|trash|spam|starred" in str(default.metadata)


def test_patch_cannot_move_a_message_into_the_virtual_starred_folder():
    from app.modules.mail.router import MessagePatch

    with pytest.raises(ValueError):
        MessagePatch(folder="starred")
    assert MessagePatch(folder="trash").folder == "trash"
    assert MessagePatch(is_starred=True).is_starred is True


class _Tx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Conn:
    folder = "inbox"
    queries: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def transaction(self):
        return _Tx()

    async def fetchrow(self, *args):
        # The real query selects mm.* and m.*; both have an "id" column and the message id wins.
        return {"id": "MESSAGE-ID", "mailbox_id": "BOX", "message_id": "MESSAGE-ID", "from_address": "a@example.test", "folder": _Conn.folder, "is_read": False, "is_starred": False}

    async def fetch(self, *args):
        _Conn.queries.append(str(args[0]))
        return []

    async def execute(self, *args):
        return None


class _Pool:
    def acquire(self):
        return _Conn()


async def test_read_message_returns_the_mailbox_message_id_the_screens_patch_with(monkeypatch):
    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(core_service, "_assert_enabled", noop)
    monkeypatch.setattr(core_service, "_audit", noop)
    monkeypatch.setattr(core_service.db, "get_pool", lambda: _Pool())
    result = await core_service.read_message("user-1", "MAILBOX-MESSAGE-ID")
    assert result["mailbox_message_id"] == "MAILBOX-MESSAGE-ID"
    assert result["recipients"] == [] and result["attachments"] == []


@pytest.mark.parametrize(("folder", "sees_all_bcc"), [("drafts", True), ("sent", True), ("inbox", False), ("trash", False)])
async def test_only_the_senders_own_copies_return_the_full_bcc_list(monkeypatch, folder, sees_all_bcc):
    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(core_service, "_assert_enabled", noop)
    monkeypatch.setattr(core_service, "_audit", noop)
    monkeypatch.setattr(core_service.db, "get_pool", lambda: _Pool())
    monkeypatch.setattr(_Conn, "folder", folder)
    monkeypatch.setattr(_Conn, "queries", [])
    await core_service.read_message("user-1", "MM")
    recipient_query = next(q for q in _Conn.queries if "message_recipient" in q)
    assert ("kind <> 'bcc'" not in recipient_query) is sees_all_bcc


_DRAFT = {"mailbox_id": "BOX", "message_id": "MSG"}
_ATTACHMENT = {"id": "ATT", "object_key": "mail/attachments/abc"}


class _DetachConn(_Conn):
    """Answers the three lookups remove_draft_attachment makes, and records what was deleted."""

    draft = {"mailbox_id": "BOX", "message_id": "MSG"}
    attachment = {"id": "ATT", "object_key": "mail/attachments/abc"}
    deleted: list[tuple] = []
    box_role = "owner"

    async def fetchrow(self, sql, *args):
        if "FROM mailbox_message" in sql:
            return self.draft
        if "FROM attachment" in sql:
            return self.attachment
        return {"state": "open", "role": self.box_role, "id": "BOX"}

    async def execute(self, sql, *args):
        _DetachConn.deleted.append((sql, args))


class _DetachPool:
    def acquire(self):
        return _DetachConn()


class _Storage:
    removed: list[str] = []

    async def delete(self, bucket, key):
        _Storage.removed.append(key)


async def _wire(monkeypatch, *, draft=True, attachment=True, role="owner"):
    import app.core.storage as storage

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(core_service, "_assert_enabled", noop)
    monkeypatch.setattr(core_service, "_audit", noop)
    monkeypatch.setattr(core_service.db, "get_pool", lambda: _DetachPool())
    monkeypatch.setattr(_DetachConn, "draft", _DRAFT if draft else None)
    monkeypatch.setattr(_DetachConn, "attachment", _ATTACHMENT if attachment else None)
    monkeypatch.setattr(_DetachConn, "box_role", role)
    monkeypatch.setattr(_DetachConn, "deleted", [])
    monkeypatch.setattr(_Storage, "removed", [])
    monkeypatch.setattr(storage, "get_storage", lambda: _Storage())


async def test_removing_a_draft_attachment_deletes_the_row_and_the_stored_file(monkeypatch):
    await _wire(monkeypatch)
    assert await core_service.remove_draft_attachment("u1", "DRAFT", "ATT") == {"removed": True}
    assert any("DELETE FROM attachment" in sql for sql, _ in _DetachConn.deleted)
    assert _Storage.removed == ["mail/attachments/abc"]


async def test_removing_from_a_missing_draft_or_a_file_not_on_it_is_a_not_found(monkeypatch):
    from app.core.errors import NotFound

    await _wire(monkeypatch, draft=False)
    with pytest.raises(NotFound):
        await core_service.remove_draft_attachment("u1", "DRAFT", "ATT")
    await _wire(monkeypatch, attachment=False)
    with pytest.raises(NotFound):
        await core_service.remove_draft_attachment("u1", "DRAFT", "ATT")
    assert _Storage.removed == []


async def test_a_read_only_member_cannot_remove_attachments(monkeypatch):
    from app.core.errors import Forbidden

    await _wire(monkeypatch, role="read")
    with pytest.raises(Forbidden):
        await core_service.remove_draft_attachment("u1", "DRAFT", "ATT")
    assert not _DetachConn.deleted
