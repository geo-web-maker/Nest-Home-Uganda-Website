from datetime import date

from app.modules.care_ops.rules import period_bounds


def test_period_bounds_for_week_fortnight_and_month():
    assert period_bounds(date(2026, 1, 7), "weekly") == (date(2026, 1, 5), date(2026, 1, 11))
    start, end = period_bounds(date(2026, 1, 7), "fortnightly")
    assert start <= date(2026, 1, 7) <= end
    assert period_bounds(date(2026, 2, 14), "monthly") == (date(2026, 2, 1), date(2026, 2, 28))
