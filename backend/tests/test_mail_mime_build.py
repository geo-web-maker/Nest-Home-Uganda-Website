"""Sent-message MIME construction tests. Written, not run here."""

from email import message_from_bytes
from email.policy import default

from app.modules.mail.mime_build import build_eml


def test_build_eml_keeps_html_and_attachment_bytes_and_hides_bcc():
    payload = build_eml(
        {
            "from_address": "staff@example.test",
            "subject": "Contract",
            "body_text": "Please review",
            "body_html": "<p>Please <strong>review</strong></p>",
            "message_id_header": "<message@example.test>",
        },
        [
            {
                "data": b"exact-contract-bytes",
                "filename": "Contract v3.pdf",
                "content_type": "application/pdf",
            }
        ],
        {"to": ["to@example.test"], "cc": ["cc@example.test"], "bcc": ["secret@example.test"]},
    )
    parsed = message_from_bytes(payload, policy=default)
    assert parsed["To"] == "to@example.test"
    assert parsed["Cc"] == "cc@example.test"
    assert parsed["Bcc"] is None
    parts = list(parsed.walk())
    assert any(part.get_content_type() == "text/html" for part in parts)
    attachment = next(part for part in parts if part.get_filename() == "Contract v3.pdf")
    assert attachment.get_payload(decode=True) == b"exact-contract-bytes"


def test_build_eml_writes_thread_headers():
    payload = build_eml(
        {
            "from_address": "staff@example.test",
            "subject": "Re: Contract",
            "body_text": "Thanks",
            "in_reply_to": "<parent@example.test>",
            "references_header": "<root@example.test> <parent@example.test>",
        },
        [],
    )
    parsed = message_from_bytes(payload, policy=default)
    assert parsed["In-Reply-To"] == "<parent@example.test>"
    assert parsed["References"] == "<root@example.test> <parent@example.test>"
