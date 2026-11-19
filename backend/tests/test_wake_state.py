"""Neon wake markers: pure scheduling rules, plus the should_run gate with a fake store."""

from datetime import UTC, datetime, timedelta

import pytest

from app.core import wake_state
from app.modules.mail import wake_rules as rules

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)


def test_outbox_idle_means_nothing_pending():
    assert rules.outbox_next_due(None, False, NOW) is None


def test_outbox_future_retry_is_kept_exactly():
    retry = NOW + timedelta(minutes=5)
    assert rules.outbox_next_due(retry, False, NOW) == retry


def test_outbox_overdue_row_is_rechecked_slowly_not_every_minute():
    # drain() requeues rows with next_attempt_at=now() when external sending is off
    assert rules.outbox_next_due(NOW - timedelta(minutes=3), False, NOW) == NOW + rules.OVERDUE_RECHECK


def test_outbox_sending_row_is_rechecked_when_its_claim_would_go_stale():
    assert rules.outbox_next_due(None, True, NOW) == NOW + rules.STALE_CLAIM


def test_outbox_takes_the_earliest_of_retry_and_stale_claim():
    retry = NOW + timedelta(minutes=2)
    assert rules.outbox_next_due(retry, True, NOW) == retry


def test_outbox_accepts_naive_timestamps():
    retry = datetime(2026, 11, 19, 12, 5)
    assert rules.outbox_next_due(retry, False, NOW) == retry.replace(tzinfo=UTC)


def test_scan_idle_and_backlog():
    assert rules.scan_next_due(False, None, None, NOW) is None
    assert rules.scan_next_due(True, None, None, NOW) == NOW


def test_scan_error_retries_after_ten_minutes_and_stale_pending_after_twenty():
    assert rules.scan_next_due(False, NOW, None, NOW) == NOW + rules.SCAN_RETRY
    assert rules.scan_next_due(False, None, NOW, NOW) == NOW + rules.SCAN_STALE_PENDING


class _FakeState:
    def __init__(self, next_due, updated_at):
        self.next_due, self.updated_at = next_due, updated_at


@pytest.fixture
def store(monkeypatch):
    holder = {"state": None, "fail": False}

    async def fake_find(key):
        if holder["fail"]:
            raise RuntimeError("mongo down")
        return holder["state"]

    monkeypatch.setattr(wake_state, "_find", fake_find, raising=False)
    monkeypatch.setattr(wake_state, "_checked_this_boot", set())
    monkeypatch.setattr(wake_state, "_last_unknown_run", {})
    return holder


async def test_first_tick_after_boot_always_checks_neon(store):
    store["state"] = _FakeState(None, NOW)
    assert await wake_state.should_run("k", now=NOW) is True


async def test_nothing_pending_skips_neon(store):
    await wake_state.should_run("k", now=NOW)
    store["state"] = _FakeState(None, NOW)
    assert await wake_state.should_run("k", now=NOW + timedelta(minutes=1)) is False


async def test_due_time_gates_the_check(store):
    await wake_state.should_run("k", now=NOW)
    store["state"] = _FakeState(NOW + timedelta(minutes=5), NOW)
    assert await wake_state.should_run("k", now=NOW + timedelta(minutes=1)) is False
    assert await wake_state.should_run("k", now=NOW + timedelta(minutes=5)) is True


async def test_safety_net_forces_a_check_when_idle_for_too_long(store):
    await wake_state.should_run("k", now=NOW)
    store["state"] = _FakeState(None, NOW)
    later = NOW + wake_state.DEFAULT_SAFETY_NET
    assert await wake_state.should_run("k", now=later) is True


async def test_unreadable_or_missing_marker_fails_open_but_throttled(store):
    await wake_state.should_run("k", now=NOW)
    store["fail"] = True
    assert await wake_state.should_run("k", now=NOW) is True
    assert await wake_state.should_run("k", now=NOW) is False  # throttled, not every minute
