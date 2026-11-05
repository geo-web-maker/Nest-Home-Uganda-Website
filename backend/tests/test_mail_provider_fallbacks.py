"""Provider capability and graceful inline-image fallback tests. Written, not run here."""
import pytest

from app.modules.mail.providers import (
    BrevoProvider, OutboundAttachment, get_provider, _html_with_inline_fallback,
)


def test_json_transport_replaces_matching_cid_image_with_attachment_notice():
    html = '<p>Logo <img src="cid:logo-1" alt="Nest logo"></p>'
    attachments = [OutboundAttachment("logo.png", "image/png", b"png", "logo-1", "inline")]
    result = _html_with_inline_fallback(html, attachments)
    assert "cid:logo-1" not in result
    assert "Nest logo attached separately" in result


def test_unrelated_cid_markup_is_not_rewritten():
    html = '<p><img src="cid:other" alt="Other"></p>'
    attachments = [OutboundAttachment("logo.png", "image/png", b"png", "logo-1", "inline")]
    assert _html_with_inline_fallback(html, attachments) == html


@pytest.mark.asyncio
async def test_brevo_smtp_provider_advertises_threading_and_inline_support(monkeypatch):
    async def setting(key):
        return {"mail.provider": "brevo", "mail.brevo_transport": "smtp"}.get(key)
    monkeypatch.setattr("app.modules.mail.providers.get_value", setting)
    provider = await get_provider()
    assert isinstance(provider, BrevoProvider)
    assert provider.supports_threading_headers is True
    assert provider.supports_inline_cid is True


@pytest.mark.asyncio
async def test_brevo_api_fallback_does_not_advertise_inline_or_threading(monkeypatch):
    async def setting(key):
        return {"mail.provider": "brevo", "mail.brevo_transport": "api"}.get(key)
    monkeypatch.setattr("app.modules.mail.providers.get_value", setting)
    provider = await get_provider()
    assert provider.supports_threading_headers is False
    assert provider.supports_inline_cid is False
