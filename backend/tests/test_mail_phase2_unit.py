# ruff: noqa: E501
from app.modules.mail.core_service import _local_part, _safe_header
from app.modules.mail.html_policy import sanitize_html
from app.modules.mail.totp import code, verify
from app.modules.mail.outbox import BACKOFF
import pytest

def test_mail_address_normalisation_strips_accents_and_unsafe_characters():
    assert _local_part('Élodie / O’Neil') == 'elodie.oneil'

def test_mail_headers_reject_crlf_injection():
    with pytest.raises(ValueError):
        _safe_header('hello\r\nBcc:attacker@example.com','subject')

def test_html_cleaner_preserves_safe_structure_and_removes_active_markup():
    safe = sanitize_html('<p>Hello</p><script>alert(1)</script><img src="cid:logo" onerror="alert(1)">')
    assert "<p>Hello</p>" in safe.html
    assert "<script>" not in safe.html
    assert "onerror" not in safe.html

def test_totp_matches_rfc6238_sha1_test_vector(monkeypatch):
    # RFC 6238 test secret (base32 encoding of ASCII "12345678901234567890")
    secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    assert code(secret, at=59)=='287082'
    import app.modules.mail.totp as totp
    monkeypatch.setattr(totp.time, 'time', lambda: 59)
    assert verify(secret,'287082')
    assert not verify(secret,'000000')

def test_outbox_backoff_is_bounded_and_matches_spec():
    assert BACKOFF == (60,300,1800,7200,21600)

def test_settings_catalogue_has_unique_keys_and_webhook_secret_is_secret():
    from app.modules.mail.defaults import DEFINITIONS, BY_KEY
    assert len(BY_KEY) == len(DEFINITIONS)
    assert BY_KEY['mail.provider_webhook_secret'].secret is True
