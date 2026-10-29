from datetime import UTC, datetime, timedelta

import pytest

from app.modules.sos_events.rules import (
    can_start_live_follow,
    is_live_follow_active,
    live_follow_deadline,
    ping_retry_after,
)


def test_live_follow_is_active_only_inside_the_server_deadline():
    started = datetime(2026, 10, 29, 9, 0, tzinfo=UTC)
    deadline = started + timedelta(minutes=30)
    assert is_live_follow_active(started, deadline, None, started)
    assert is_live_follow_active(started, deadline, None, deadline - timedelta(microseconds=1))
    assert not is_live_follow_active(started, deadline, None, deadline)
    assert not is_live_follow_active(
        started, deadline, started + timedelta(minutes=2), started + timedelta(minutes=3)
    )
    assert not is_live_follow_active(None, deadline, None, started)


def test_live_follow_deadline_is_server_clocked_and_rejects_unsafe_durations():
    now = datetime(2026, 10, 29, 9, 0, tzinfo=UTC)
    assert live_follow_deadline(now, 30) == now + timedelta(minutes=30)
    for duration in (0, -1, 121, True):
        with pytest.raises(ValueError):
            live_follow_deadline(now, duration)


def test_ping_rate_limit_uses_server_received_time_and_rounds_up_retry_seconds():
    last_ping = datetime(2026, 10, 29, 9, 0, tzinfo=UTC)
    assert ping_retry_after(None, last_ping, 30) == 0
    assert ping_retry_after(last_ping, last_ping + timedelta(seconds=10), 30) == 20
    assert ping_retry_after(last_ping, last_ping + timedelta(seconds=29, microseconds=1), 30) == 1
    assert ping_retry_after(last_ping, last_ping + timedelta(seconds=30), 30) == 0
    with pytest.raises(ValueError):
        ping_retry_after(last_ping, last_ping, 14)


def test_closed_sos_cases_cannot_start_follow_again():
    assert can_start_live_follow("sent")
    assert can_start_live_follow("acknowledged")
    for status in ("resolved", "closed", "cancelled", "RESOLVED"):
        assert not can_start_live_follow(status)
