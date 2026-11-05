"""SMTP envelope/Bcc and frozen MIME tests. Written, not run here."""
import sys
from types import SimpleNamespace
from email import policy
from email.parser import BytesParser

import pytest

from app.modules.mail.providers import BrevoProvider, OutboundMessage


@pytest.mark.asyncio
async def test_brevo_smtp_builds_rfc822_and_keeps_bcc_envelope_only(monkeypatch):
    captured = {}
    async def setting(key):
        return {
            "mail.smtp_host": "smtp.example.test",
            "mail.smtp_port": 587,
            "mail.smtp_username": "smtp-user",
            "mail.smtp_password": "smtp-secret",
        }.get(key)
    async def fake_send(raw, **kwargs):
        captured["raw"] = raw
        captured.update(kwargs)
    monkeypatch.setattr("app.modules.mail.providers.get_value", setting)
    monkeypatch.setitem(sys.modules, "aiosmtplib", SimpleNamespace(send=fake_send))
    message = OutboundMessage(
        from_address="sender@example.test", from_name="Nest", to=["to@example.test"],
        cc=["cc@example.test"], bcc=["blind@example.test"], subject="Test",
        html="<p>Hi</p>", text="Hi", reply_to="reply@example.test",
        headers={"X-Mailin-custom": "outbox-1"},
    )
    result = await BrevoProvider()._send_smtp(message)
    assert result.ok
    assert captured["recipients"] == ["to@example.test", "cc@example.test", "blind@example.test"]
    parsed = BytesParser(policy=policy.default).parsebytes(captured["raw"])
    assert parsed["Bcc"] is None
    assert parsed["Reply-To"] == "reply@example.test"
    assert parsed["X-Mailin-custom"] == "outbox-1"
