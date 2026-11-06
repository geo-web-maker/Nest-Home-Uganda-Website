from datetime import UTC, datetime

from app.modules.mail.delivery_detail import build_delivery, redact


def _row(**kw):
    base = {"state": "deferred", "last_error": None, "provider": "brevo", "attempts": 2,
            "next_attempt_at": datetime(2026, 11, 7, tzinfo=UTC)}
    base.update(kw)
    return base


def test_provider_detail_is_hidden_from_mailbox_user_and_available_to_admin():
    row = _row(last_error="worker lease expired")
    user_view = build_delivery(row, [])
    admin_view = build_delivery(row, [], include_detail=True)
    assert user_view["reason"].startswith("The mail worker restarted")
    assert user_view["detail"] is None
    assert admin_view["detail"] == "worker lease expired"
    assert user_view["can_retry"] is True and user_view["attempts"] == 2


def test_unknown_error_is_generic_to_mailbox_user_but_admin_can_inspect_it():
    row = _row(last_error="SMTPSenderRefused")
    user_view = build_delivery(row, [])
    admin_view = build_delivery(row, [], include_detail=True)
    assert user_view["reason"] == "Delivery needs attention."
    assert user_view["detail"] is None
    assert admin_view["detail"] == "SMTPSenderRefused"


def test_secrets_are_redacted():
    out = redact("auth failed key xsmtpsib-" + "a" * 40 + "-Zz9 and " + "B" * 40)
    assert "xsmtpsib" not in out and "BBBB" not in out and "[hidden]" in out


def test_sent_cannot_retry_and_has_no_next_attempt():
    d = build_delivery(_row(state="sent"), [])
    assert d["can_retry"] is False and d["next_attempt_at"] is None


def test_failed_can_retry_without_next_attempt():
    d = build_delivery(_row(state="failed", last_error="x"), [])
    assert d["can_retry"] is True and d["next_attempt_at"] is None


def test_ambiguous_smtp_send_requires_manual_review_not_automatic_retry():
    d = build_delivery(_row(state="failed", last_error="delivery_outcome_unknown_manual_review: SMTPTimeoutError"), [])
    admin = build_delivery(_row(state="failed", last_error="delivery_outcome_unknown_manual_review: SMTPTimeoutError"), [], include_detail=True)
    assert d["can_retry"] is False
    assert "not automatically resent" in d["reason"]
    assert admin["detail"] == "SMTPTimeoutError"
