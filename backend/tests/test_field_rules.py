from datetime import UTC, datetime, timedelta

from app.modules.field.rules import clock_offset_s, event_rejection, verification_label


def test_clock_offset_sign():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert clock_offset_s(now, now - timedelta(minutes=5)) == 300
    assert clock_offset_s(now, now + timedelta(minutes=5)) == -300


def test_rejection_table_and_privacy_label():
    assert event_rejection("cancelled", "check_in") == "visit_cancelled"
    assert event_rejection("in_progress", "check_in") == "already_checked_in"
    assert event_rejection("scheduled", "check_out") == "not_checked_in"
    assert verification_label("outside_radius") == "needs_review"
    assert verification_label("verified") == "verified"
