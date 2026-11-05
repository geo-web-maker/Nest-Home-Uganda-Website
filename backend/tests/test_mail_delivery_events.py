"""Delivery event mapping regressions. Written, not run here."""
from app.modules.mail.delivery import normalise_delivery_payload


def test_resend_recipient_events_are_normalised_individually():
    payload = {
        "type": "email.delivery_delayed",
        "created_at": "2026-11-05T08:00:00Z",
        "data": {"email_id": "re_123", "to": ["one@example.test"], "subject": "Hello"},
    }
    events = normalise_delivery_payload("resend", payload, b"resend-delayed")
    assert len(events) == 1
    assert events[0]["address"] == "one@example.test"
    assert events[0]["event"] == "deferred"
    assert events[0]["provider_message_id"] == "re_123"


def test_resend_temporary_bounce_is_soft_bounce_not_permanent_suppression():
    payload = {
        "type": "email.bounced",
        "data": {"email_id": "re_124", "to": ["one@example.test"], "bounce": {"type": "Transient", "message": "Mailbox busy"}},
    }
    events = normalise_delivery_payload("resend", payload, b"resend-soft-bounce")
    assert events[0]["event"] == "soft_bounce"


def test_brevo_custom_id_correlates_with_outbox_and_keeps_soft_bounce():
    payload = {
        "event": "soft_bounce", "email": "one@example.test", "message-id": "brevo-987",
        "X-Mailin-custom": "nest-outbox:00000000-0000-0000-0000-000000000001",
        "ts_event": 1793865600, "reason": "Temporary mailbox issue",
    }
    events = normalise_delivery_payload("brevo", payload, b"brevo-soft-bounce")
    assert len(events) == 1
    assert events[0]["event"] == "soft_bounce"
    assert events[0]["custom_id"].startswith("nest-outbox:")


def test_non_delivery_resend_events_are_ignored():
    payload = {"type": "email.opened", "data": {"to": ["one@example.test"]}}
    assert normalise_delivery_payload("resend", payload, b"opened") == []


def test_event_fingerprint_is_stable_when_json_key_order_changes():
    first = {
        "type": "email.delivered",
        "created_at": "2026-11-05T08:00:00Z",
        "data": {"email_id": "re_999", "to": ["one@example.test"]},
    }
    second = {
        "data": {"to": ["one@example.test"], "email_id": "re_999"},
        "created_at": "2026-11-05T08:00:00Z",
        "type": "email.delivered",
    }
    a = normalise_delivery_payload("resend", first, b'{"type":"email.delivered"}')
    b = normalise_delivery_payload("resend", second, b'{"type":"email.delivered"}')
    assert a[0]["event_key"] == b[0]["event_key"]


def test_event_without_timestamp_uses_stable_raw_body_fingerprint():
    payload = {"event": "delivered", "email": "one@example.test", "message-id": "m-1"}
    raw = b'{"event":"delivered","email":"one@example.test","message-id":"m-1"}'
    first = normalise_delivery_payload("brevo", payload, raw)
    second = normalise_delivery_payload("brevo", payload, raw)
    assert first[0]["event_key"] == second[0]["event_key"]


def test_resend_failed_event_is_recorded_without_becoming_a_suppression_event():
    payload = {
        "type": "email.failed",
        "created_at": "2026-11-05T08:00:00Z",
        "data": {"email_id": "re_failed", "to": ["one@example.test"]},
    }
    events = normalise_delivery_payload("resend", payload, b"failed")
    assert len(events) == 1
    assert events[0]["event"] == "failed"
