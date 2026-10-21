"""Pure rules: status transitions, WhatsApp text, SMS text, reminders, retention."""

from datetime import UTC, datetime, timedelta

import pytest

from app.modules.enquiries import rules

T0 = datetime(2026, 10, 19, 8, 0, tzinfo=UTC)


def test_reference_format() -> None:
    assert rules.format_reference(123) == "NHC-000123"


def test_every_status_has_a_transition_row_and_none_points_at_itself() -> None:
    for status, targets in rules.TRANSITIONS.items():
        assert status not in targets
    assert set(rules.TRANSITIONS) == {
        "new", "contacted", "assessment_booked", "care_started", "not_proceeding", "spam",
    }  # fmt: skip


@pytest.mark.parametrize(
    ("current", "target", "ok"),
    [
        ("new", "contacted", True),
        ("new", "care_started", False),
        ("contacted", "assessment_booked", True),
        ("assessment_booked", "care_started", True),
        ("care_started", "contacted", False),
        ("not_proceeding", "contacted", True),
        ("spam", "new", True),
        ("spam", "care_started", False),
    ],
)
def test_transitions(current: str, target: str, ok: bool) -> None:
    assert rules.can_transition(current, target) is ok  # type: ignore[arg-type]


def test_whatsapp_message_and_url_follow_the_spec() -> None:
    msg = rules.whatsapp_message(
        "Hello Nest Home Care, I would like to book",
        ["Postnatal care", "Physiotherapy"],
        "Mary Atim",
        "Ntinda",
        "NHC-000007",
    )
    assert msg == (
        "Hello Nest Home Care, I would like to book: Postnatal care, Physiotherapy. "
        "Name: Mary Atim. Area: Ntinda. Ref: NHC-000007."
    )
    url = rules.whatsapp_url("256787499988", msg)
    assert url.startswith("https://wa.me/256787499988?text=Hello%20Nest")
    assert " " not in url and "&" not in url.split("?text=")[1]


def test_staff_sms_is_one_segment_and_has_no_note_even_with_long_names() -> None:
    text = rules.staff_new_enquiry_sms("NHC-000001", "N" * 80, "A" * 80, "0787499988")
    assert len(text) <= rules.SMS_MAX_CHARS
    assert text.startswith("New enquiry NHC-000001: ") and text.endswith("Call 0787499988.")


def test_reminder_sms_fits_one_segment() -> None:
    assert len(rules.staff_reminder_sms("NHC-000001", "N" * 80, "0787499988", 90)) <= 160


def test_within_hours_is_half_open() -> None:
    at = lambda h, m: datetime(2026, 10, 19, h, m)  # noqa: E731
    assert rules.within_hours(at(7, 0), "07:00", "20:00")
    assert rules.within_hours(at(19, 59), "07:00", "20:00")
    assert not rules.within_hours(at(20, 0), "07:00", "20:00")
    assert not rules.within_hours(at(6, 59), "07:00", "20:00")


def _due(**kw) -> bool:
    base = dict(
        status="new", created_at=T0, last_reminder_at=None, reminders_sent=0,
        now=T0 + timedelta(minutes=31), interval_minutes=30, in_working_hours=True,
    )  # fmt: skip
    return rules.reminder_due(**{**base, **kw})


def test_reminder_waits_for_the_interval() -> None:
    assert _due()
    assert not _due(now=T0 + timedelta(minutes=29))


def test_reminder_repeats_every_interval_from_the_last_one_up_to_three() -> None:
    last = T0 + timedelta(minutes=31)
    assert not _due(last_reminder_at=last, reminders_sent=1, now=last + timedelta(minutes=29))
    assert _due(last_reminder_at=last, reminders_sent=1, now=last + timedelta(minutes=30))
    assert not _due(last_reminder_at=last, reminders_sent=3, now=last + timedelta(hours=5))


def test_no_reminder_outside_hours_or_once_contacted() -> None:
    assert not _due(in_working_hours=False)
    assert not _due(status="contacted")


def test_retention_anonymises_after_24_months_but_never_clients() -> None:
    now = datetime(2026, 10, 19, tzinfo=UTC)
    old = now - timedelta(days=731)
    assert rules.retention_due("new", old, False, now)
    assert rules.retention_due("not_proceeding", old, False, now)
    assert not rules.retention_due("care_started", old, False, now)
    assert not rules.retention_due("new", old, True, now)  # already done
    assert not rules.retention_due("new", now - timedelta(days=729), False, now)
