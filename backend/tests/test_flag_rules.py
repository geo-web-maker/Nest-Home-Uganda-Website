from datetime import UTC, datetime, timedelta

from app.modules.visits.rules import flags_for_event


def test_verification_and_clock_skew_flags():
    visit = {
        "scheduled_start": datetime(2026, 1, 1, tzinfo=UTC),
        "scheduled_end": datetime(2026, 1, 1, 1, tzinfo=UTC),
        "check_in_at": datetime(2026, 1, 1, tzinfo=UTC),
    }
    assert "no_location" in flags_for_event(
        {"verification": "no_location", "clock_offset_s": 0, "type": "check_in"}, visit, {}
    )
    assert "clock_skew" not in flags_for_event(
        {"verification": "verified", "clock_offset_s": 600, "type": "check_in"},
        visit,
        {"clock_skew_min": 10},
    )
    assert "clock_skew" in flags_for_event(
        {"verification": "verified", "clock_offset_s": 601, "type": "check_in"},
        visit,
        {"clock_skew_min": 10},
    )


def test_duration_flags():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(hours=1)
    visit = {"scheduled_start": start, "scheduled_end": end, "check_in_at": start}
    assert "duration_short" in flags_for_event(
        {
            "verification": "verified",
            "clock_offset_s": 0,
            "type": "check_out",
            "device_time": start + timedelta(minutes=20),
        },
        visit,
        {"short_visit_pct": 50},
    )
    assert "duration_long" in flags_for_event(
        {
            "verification": "verified",
            "clock_offset_s": 0,
            "type": "check_out",
            "device_time": start + timedelta(hours=3),
        },
        visit,
        {"long_visit_pct": 200},
    )
