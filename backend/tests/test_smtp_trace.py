"""SMTP trace against a local fake server (STARTTLS + AUTH). Needs aiosmtpd; skipped when absent."""
import functools
import json
import os
import ssl

import pytest

pytest.importorskip("aiosmtpd")
from aiosmtpd.controller import Controller  # noqa: E402
from aiosmtpd.smtp import AuthResult, LoginPassword  # noqa: E402

from app.modules.mail import smtp_trace  # noqa: E402

CERT = os.environ.get("TRACE_TEST_CERT", "")
KEY = os.environ.get("TRACE_TEST_KEY", "")
GOOD_KEY = "xsmtpsib-" + "a" * 40 + "-GoodK3y"
pytestmark = pytest.mark.skipif(not (CERT and KEY), reason="set TRACE_TEST_CERT and TRACE_TEST_KEY")


class Sink:
    async def handle_DATA(self, server, session, envelope):
        return "250 OK queued"


def _auth(server, session, envelope, mechanism, auth_data):
    ok = isinstance(auth_data, LoginPassword) and auth_data.password == GOOD_KEY.encode() and auth_data.login == b"user@smtp-brevo.com"
    return AuthResult(success=ok, handled=False) if not ok else AuthResult(success=True)


@pytest.fixture
def server(monkeypatch):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    import socket
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    ctrl = Controller(Sink(), hostname="127.0.0.1", port=free_port, tls_context=ctx, require_starttls=True,
                      authenticator=_auth, auth_required=True, auth_require_tls=True)
    ctrl.start()
    import aiosmtplib
    monkeypatch.setattr(aiosmtplib, "SMTP", functools.partial(aiosmtplib.SMTP, validate_certs=False))
    yield ctrl
    ctrl.stop()


def _getter(port, password, username="user@smtp-brevo.com"):
    values = {"mail.provider": "brevo", "mail.brevo_transport": "smtp", "mail.smtp_host": "127.0.0.1", "mail.smtp_port": port,
              "mail.smtp_username": username, "mail.smtp_password": password, "mail.domain": "example.org", "mail.from_name": "Test"}

    async def get(key):
        return values[key]
    return get


class _NoNet:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url):
        class R:
            is_success = True
            text = "203.0.113.9"
            status_code = 200
        return R()


def _names(result):
    return [s["step"] for s in result["steps"]]


async def test_wrong_key_reports_server_535_with_full_detail(server):
    bad = "xsmtpsib-" + "b" * 40 + "-BadK3yZZ"
    result = await smtp_trace.run_trace(_getter(server.port, bad), compare_key=GOOD_KEY, http_client_factory=_NoNet)
    blob = json.dumps(result)
    assert bad in blob  # unredacted on purpose: the router keeps this behind a verified authenticator code
    attempts = [x for x in result["steps"] if x["step"].startswith("auth_attempt:")]
    assert attempts and all(not a["ok"] and a["smtp_code"] == 535 for a in attempts)
    client_lines = [w for w in result["wire"] if w["dir"] == "client"]
    assert any(w["line"].startswith("EHLO") for w in client_lines)
    assert any(w.get("decoded") == "\\0user@smtp-brevo.com\\0" + bad for w in client_lines)  # the exact login bytes sent
    assert any(w["dir"] == "server" and w["line"].startswith("535") for w in result["wire"])
    auth = next(s for s in result["steps"] if s["step"] == "auth")
    assert auth["ok"] is False and auth["smtp_code"] == 535
    assert _names(result)[:6] == ["settings", "egress_ip", "dns", "tcp_connect", "smtp_connect", "ehlo"]
    assert "starttls" in _names(result)
    settings = result["steps"][0]
    assert settings["password"]["matches_supplied_key"] is False and settings["password"]["last4"] == bad[-4:]
    assert result["egress_ip"] == "203.0.113.9"
    assert any("NOT the key you supplied" in n for n in result["notes"])


async def test_good_key_logs_in_and_sends(server):
    result = await smtp_trace.run_trace(_getter(server.port, GOOD_KEY), send_to="dest@example.net", http_client_factory=_NoNet)
    steps = {s["step"]: s for s in result["steps"]}
    assert steps["auth"]["ok"] is True
    assert steps["send"]["ok"] is True and steps["send"]["envelope_to"] == "dest@example.net"
    assert any(w["dir"] == "server" and w["line"].startswith("235") for w in result["wire"])


async def test_whitespace_and_api_key_are_flagged(server):
    result = await smtp_trace.run_trace(_getter(server.port, "xkeysib-abc def "), http_client_factory=_NoNet)
    pw = result["steps"][0]["password"]
    assert pw["kind"] == "api_key" and pw["has_leading_or_trailing_space"] and pw["has_inner_whitespace"]
    assert any("API key" in n for n in result["notes"])


async def test_unreadable_setting_is_reported():
    async def get(key):
        raise RuntimeError("Stored mail secret is invalid. Replace it in settings.")
    result = await smtp_trace.run_trace(get)
    assert result["steps"][0]["step"] == "read_settings" and "Stored mail secret" in result["steps"][0]["detail"]


async def test_username_with_leading_space_is_found(server):
    result = await smtp_trace.run_trace(_getter(server.port, GOOD_KEY, username=" user@smtp-brevo.com"), http_client_factory=_NoNet)
    assert result["steps"][0]["username"]["has_leading_or_trailing_space"] is True
    assert any("FOUND IT" in n and "username" in n for n in result["notes"])
