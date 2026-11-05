"""Filename handling for signed object downloads. Written, not run here."""

from app.core.storage import content_disposition


def test_content_disposition_has_ascii_and_utf8_filename_forms():
    value = content_disposition("Contrat été.pdf")
    assert 'filename="Contrat t.pdf"' in value or 'filename="Contrat ?t.pdf"' in value
    assert "filename*=UTF-8''Contrat%20%C3%A9t%C3%A9.pdf" in value


def test_content_disposition_strips_header_injection_and_quotes():
    value = content_disposition('report"\r\nBcc:evil@example.test.pdf')
    assert "\r" not in value
    assert "\n" not in value
    assert "Bcc:" in value
    assert 'filename="report_' in value
