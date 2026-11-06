import sys
from types import SimpleNamespace

import pytest

from app.modules.mail.providers import BrevoProvider, OutboundMessage


@pytest.mark.asyncio
async def test_smtp_network_exception_is_marked_unknown_not_retryable(monkeypatch):
    async def get_value(key):
        return {
            "mail.smtp_host": "smtp.example.test",
            "mail.smtp_port": 587,
            "mail.smtp_username": "mailer",
            "mail.smtp_password": "not-a-real-secret",
        }.get(key)

    async def fail_send(*args, **kwargs):
        raise TimeoutError("connection dropped during DATA")

    monkeypatch.setattr("app.modules.mail.providers.get_value", get_value)
    monkeypatch.setitem(sys.modules, "aiosmtplib", SimpleNamespace(send=fail_send))
    message = OutboundMessage(
        from_address="sender@example.test", from_name=None,
        to=["recipient@example.test"], cc=[], bcc=[], subject="Test",
        html=None, text="Test", rfc822=b"RFC822 test payload",
    )

    result = await BrevoProvider()._send_smtp(message)

    assert result.ok is False
    assert result.retryable is False
    assert result.outcome_unknown is True
    assert "TimeoutError" in (result.error or "")
