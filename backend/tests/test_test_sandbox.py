"""Test-account sandbox rules: master switch, delivery allowlist, no email access. (Written, not run.)"""

import pytest

from app.core import sandbox


def _set(delivery="sink", emails=(), phones=(), enabled=True):
    import time
    sandbox._cache.update(at=time.monotonic(), ids=frozenset({"u1"}), emails=frozenset({"test.nurse@example.com"}),
                          enabled=enabled, delivery=delivery,
                          allow_emails=frozenset(emails), allow_phones=frozenset(phones))


@pytest.mark.asyncio
async def test_default_sends_nowhere():
    _set()
    assert await sandbox.allowed_emails(["me@example.org"]) == []
    assert await sandbox.allowed_phone("+256700000000") is False


@pytest.mark.asyncio
async def test_allowlist_delivers_only_to_listed_addresses():
    _set("allowlist", emails={"me@example.org"}, phones={"+256700000000"})
    assert await sandbox.allowed_emails(["me@example.org", "client@example.org"]) == ["me@example.org"]
    assert await sandbox.allowed_phone("+256700000000") is True
    assert await sandbox.allowed_phone("+256711111111") is False


@pytest.mark.asyncio
async def test_test_account_address_is_never_deliverable():
    _set("allowlist", emails={"test.nurse@example.com"})
    assert await sandbox.allowed_emails("test.nurse@example.com") == []


@pytest.mark.asyncio
async def test_master_switch_reads_config():
    _set(enabled=False)
    assert await sandbox.master_enabled() is False
    _set(enabled=True)
    assert await sandbox.master_enabled() is True


def test_real_users_skip_test_owned_rows_and_test_users_do_not():
    sandbox._hidden.set(("u1", "u2"))
    assert sandbox._hidden_expression("nurse_id") == {"nurse_id": {"$nin": ["u1", "u2"]}}
    sandbox.reveal()
    assert sandbox._hidden_expression("nurse_id") is None
