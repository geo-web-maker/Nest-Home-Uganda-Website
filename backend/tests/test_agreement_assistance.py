"""Assisted fill: the client asks Bloomwell to fill the form in; staff save quietly, then mark it ready (no database)."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.agreements import messages, service
from app.modules.agreements.schemas import FillModeChoice

NOW = datetime.now(UTC)


def doc(**kw):
    base = dict(fill_mode=None, assistance_requested_at=None, assistance_ready_at=None, assistance_note=None, status="client_in_progress")
    base.update(kw)
    return SimpleNamespace(**base)


def test_no_choice_means_no_assistance():
    assert service.assistance_state(doc()) == "none"
    assert not service.assistance_open(doc())


def test_self_fill_is_never_assistance():
    assert service.assistance_state(doc(fill_mode="self")) == "none"


def test_requested_is_open_while_the_agreement_is_open():
    d = doc(fill_mode="assisted", assistance_requested_at=NOW)
    assert service.assistance_state(d) == "requested"
    assert service.assistance_open(d)
    assert service.assistance_open(doc(fill_mode="assisted", assistance_requested_at=NOW, status="sent"))


def test_ready_closes_the_quiet_save_window():
    d = doc(fill_mode="assisted", assistance_requested_at=NOW, assistance_ready_at=NOW + timedelta(minutes=5))
    assert service.assistance_state(d) == "ready"
    assert not service.assistance_open(d)


def test_a_new_request_after_ready_reopens_it():
    d = doc(fill_mode="assisted", assistance_requested_at=NOW + timedelta(hours=1), assistance_ready_at=NOW)
    assert service.assistance_state(d) == "requested"


def test_locked_agreements_are_never_open_for_assistance():
    for status in ("client_signed", "completed", "voided", "expired"):
        assert not service.assistance_open(doc(fill_mode="assisted", assistance_requested_at=NOW, status=status))


def test_summary_is_json_friendly():
    summary = service.assistance_summary(doc(fill_mode="assisted", assistance_requested_at=NOW))
    assert summary["state"] == "requested" and isinstance(summary["requested_at"], str) and summary["ready_at"] is None


def test_choice_schema_accepts_only_known_modes_and_caps_the_note():
    assert FillModeChoice(mode="assisted", note="I find forms hard").mode == "assisted"
    with pytest.raises(ValueError):
        FillModeChoice(mode="other")
    with pytest.raises(ValueError):
        FillModeChoice(mode="assisted", note="x" * 501)
    with pytest.raises(ValueError):
        FillModeChoice(mode="self", surprise=1)


def test_staff_alert_message_exists_and_has_no_client_details():
    default = messages.DEFAULTS[("assistance_requested", "email")]
    assert "{{reference}}" in default.subject
    assert "{{client_name}}" not in default.body
