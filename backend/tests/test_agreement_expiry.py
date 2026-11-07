from datetime import UTC, datetime, timedelta

from app.modules.agreements import service
from app.modules.agreements.schemas import SendAgreement


def test_expiry_date_is_the_kampala_calendar_day():
    # 01:00 Kampala on 21 Nov is 22:00 UTC on 20 Nov: the client must be told 21 Nov.
    assert service.local_expiry_date(datetime(2026, 11, 20, 22, 0, tzinfo=UTC)) == "21 Nov 2026"
    assert service.local_expiry_date(datetime(2026, 11, 21, 12, 0, tzinfo=UTC)) == "21 Nov 2026"
    assert service.local_expiry_date(None) == ""


def test_naive_datetimes_are_treated_as_utc():
    assert service.local_expiry_date(datetime(2026, 11, 20, 22, 0)) == "21 Nov 2026"


def test_default_link_lifetime_is_fourteen_days_and_bounded():
    assert SendAgreement().expires_days == 14
    for bad in (0, 31, -1):
        try:
            SendAgreement(expires_days=bad)
        except Exception:
            continue
        raise AssertionError(f"{bad} days should be refused")
    sent = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
    assert service.local_expiry_date(sent + timedelta(days=14)) == "21 Nov 2026"
