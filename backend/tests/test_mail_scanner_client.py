"""Written, not run here. HTTP scanner client tests use httpx.MockTransport."""
import pytest
import httpx

from app.modules.mail import scanner


@pytest.mark.asyncio
async def test_scanner_disabled(monkeypatch):
    async def value(key):
        return False if key == "mail.scan_enabled" else None
    monkeypatch.setattr(scanner, "get_value", value)
    result = await scanner.scan_object("mail/attachments/x", "a" * 64)
    assert result.state == "unscanned"


@pytest.mark.asyncio
async def test_scanner_returns_clean(monkeypatch):
    async def value(key):
        return {
            "mail.scan_enabled": True, "mail.scan_mode": "http",
            "mail.scan_url": "https://scanner.example", "mail.scan_token": "secret",
            "mail.scan_timeout_seconds": 3,
        }.get(key)
    monkeypatch.setattr(scanner, "get_value", value)
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            assert url == "https://scanner.example/scan"
            assert kwargs["headers"]["Authorization"] == "Bearer secret"
            return httpx.Response(200, json={"state": "clean", "detail": ""}, request=httpx.Request("POST", url))
    monkeypatch.setattr(scanner.httpx, "AsyncClient", Client)
    assert (await scanner.scan_object("mail/attachments/x", "a" * 64)).state == "clean"
