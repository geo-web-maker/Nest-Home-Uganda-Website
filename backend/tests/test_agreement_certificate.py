"""Certificate of completion: what a signer sees on screen vs what the sealed PDF records."""

from app.modules.agreements import render, service

CERT = {
    "reference": "BW-TEST-1", "template_version": 1, "template_hash": "t" * 8,
    "parties": {"client": "Jane Client", "patient": "Pat Patient", "bloomwell_signatory": "Nurse Lead"},
    "client_signed_at": "2026-11-09T10:00:00+00:00", "countersigned_at": "2026-11-09T11:00:00+00:00",
    "sealed_at": "2026-11-09T11:00:01+00:00", "content_hash": "abc123",
    "signers": [
        {"role": "client", "name": "Jane Client", "method": "drawn", "signed_at": "2026-11-09T10:00:00+00:00",
         "ip_address": "203.0.113.9", "user_agent": "TestBrowser/1.0", "email": "j@example.com",
         "phone": "+256700000000", "code_verified_at": "2026-11-09T09:59:00+00:00"},
    ],
}


def test_public_certificate_hides_network_and_contact_evidence():
    public = render.public_certificate(CERT)
    text = str(public)
    assert public["client"] == "Jane Client" and public["signers"][0]["method"] == "drawn"
    for secret in ("203.0.113.9", "TestBrowser", "j@example.com", "+256700000000"):
        assert secret not in text


def test_pdf_certificate_keeps_full_evidence_and_is_readable():
    html_doc = render.certificate_html(CERT)
    assert "Certificate of completion" in html_doc and "203.0.113.9" in html_doc
    assert "Drawn signature" in html_doc and "09 Nov 2026" in html_doc


def test_resend_gap_is_one_minute():
    assert service.OTP_RESEND_SECONDS == 60


def test_verify_link_uses_content_fingerprint_not_pdf_hash():
    assert render.verify_url("BW-TEST-1", "abcdef0123456789ffff") == "https://bhcug.com/verify/BW-TEST-1/abcdef0123456789"


def test_masked_name_does_not_reveal_full_name():
    assert render.mask_name("Jane Client") == "J*** C*****"
    assert render.mask_name(None) == "—"


def test_sealed_certificate_prints_verify_box_with_qr():
    html_doc = render.certificate_html({**CERT, "content_hash": "abcdef0123456789ffff"})
    assert "https://bhcug.com/verify/BW-TEST-1/abcdef0123456789" in html_doc
    assert "<svg" in html_doc  # QR code (needs segno)
