from datetime import UTC, datetime

from app.modules.care_retention.retention import cutoff_months


def test_unset_or_zero_retention_never_purges():
    now = datetime(2026, 10, 25, 0, 0, tzinfo=UTC)
    assert cutoff_months(now, 0) is None


def test_month_cutoff_handles_end_of_month():
    now = datetime(2026, 3, 31, 12, 0, tzinfo=UTC)
    assert cutoff_months(now, 1) == datetime(2026, 2, 28, 12, 0, tzinfo=UTC)


def test_retention_cutoff_does_not_infer_a_period_from_zero():
    now = datetime(2026, 10, 25, 0, 0, tzinfo=UTC)
    assert cutoff_months(now, 0) is None
    assert cutoff_months(now, -1) is None
