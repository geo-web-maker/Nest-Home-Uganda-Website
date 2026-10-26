from datetime import UTC, datetime, timedelta

import pytest

from app.modules.visits.rules import VisitRuleError, overlaps, validate_schedule


def test_touching_visits_do_not_overlap():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    assert not overlaps(
        start, start + timedelta(hours=1), start + timedelta(hours=1), start + timedelta(hours=2)
    )


def test_schedule_requires_place_client_and_end_after_start():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(hours=1)
    with pytest.raises(VisitRuleError):
        validate_schedule(start, start, "c", {"client_id": "c"}, "n", [])
    with pytest.raises(VisitRuleError):
        validate_schedule(start, end, "c", {"client_id": "other"}, "n", [])
