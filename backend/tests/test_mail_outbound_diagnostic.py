from types import SimpleNamespace

from fastapi import Response

import pytest

from app.modules.mail import providers, router, settings_service


class RecordingProvider:
    name = "resend"

    def __init__(self):
        self.kwargs = None

    async def send(self, *args, **kwargs):
        self.kwargs = (args, kwargs)
        return providers.MailSendResult(ok=True, provider_message_id="provider-accepted-123")


@pytest.fixture
def send_test(monkeypatch):
    values = {
        "mail.enabled": True,
        "mail.suspend_all_sending": False,
        "mail.external_enabled": True,
        "mail.domain": "nesthomecare.org",
        "mail.from_name": "Nest Mail",
        "mail.reply_to": "support@nesthomecare.org",
    }
    async def get_value(key, **_kwargs):
        return values.get(key)

    provider = RecordingProvider()
    async def current(user_id, token):
        return token == "verified"

    monkeypatch.setattr(router, "is_current_totp_session", current)
    monkeypatch.setattr(settings_service, "get_value", get_value)
    monkeypatch.setattr(providers, "get_provider", lambda: _async_return(provider))
    return values, provider


async def _async_return(value):
    return value


async def test_external_test_sends_real_attachment_and_returns_provider_acceptance(send_test):
    _values, provider = send_test
    body = router.TestSendBody(to="recipient@example.net", include_attachment=True)
    response = Response()
    result = await router.mail_test_send(body, response, SimpleNamespace(user_id="admin"), "verified")

    assert response.headers["cache-control"] == "no-store"
    args, kwargs = provider.kwargs
    assert args[0] == ["recipient@example.net"]
    assert args[1].startswith("Email diagnostics test ")
    assert len(kwargs["attachments"]) == 1
    attachment = kwargs["attachments"][0]
    assert attachment.filename == "nest-email-diagnostics.txt"
    assert attachment.content_type == "text/plain"
    assert attachment.data.startswith(b"Nest email diagnostics attachment")
    assert kwargs["from_address"] == "no-reply@nesthomecare.org"
    assert kwargs["idempotency_key"].startswith("mail-diagnostics:admin:")
    assert result["sent"] is True
    assert result["recipient"] == "recipient@example.net"
    assert result["provider_message_id"] == "provider-accepted-123"
    assert result["attachment_included"] is True
    assert result["attachment_size_bytes"] == len(attachment.data)


async def test_external_test_can_omit_attachment(send_test):
    _values, provider = send_test
    result = await router.mail_test_send(
        router.TestSendBody(to="recipient@example.net", include_attachment=False),
        Response(), SimpleNamespace(user_id="admin"), "verified",
    )
    assert provider.kwargs[1]["attachments"] == []
    assert result["attachment_included"] is False
    assert result["attachment_filename"] is None


@pytest.mark.parametrize(
    ("setting", "value", "message"),
    [
        ("mail.enabled", False, "Mail is disabled"),
        ("mail.suspend_all_sending", True, "suspended"),
        ("mail.external_enabled", False, "External sending is disabled"),
    ],
)
async def test_external_test_does_not_send_when_sending_is_blocked(send_test, setting, value, message):
    values, provider = send_test
    values[setting] = value
    with pytest.raises(Exception, match=message):
        await router.mail_test_send(
            router.TestSendBody(to="recipient@example.net"),
            Response(), SimpleNamespace(user_id="admin"), "verified",
        )
    assert provider.kwargs is None


async def test_external_test_rejects_unverified_totp_before_provider_access(send_test):
    with pytest.raises(Exception, match="authenticator code"):
        await router.mail_test_send(
            router.TestSendBody(to="recipient@example.net"),
            Response(), SimpleNamespace(user_id="admin"), "forged",
        )


async def test_console_provider_explains_that_it_does_not_send_externally(send_test, monkeypatch):
    _values, provider = send_test
    provider.name = "console"
    result = await router.mail_test_send(
        router.TestSendBody(to="recipient@example.net"),
        Response(), SimpleNamespace(user_id="admin"), "verified",
    )
    assert result["sent"] is False
    assert "sends nothing externally" in result["message"]
    assert provider.kwargs is None
