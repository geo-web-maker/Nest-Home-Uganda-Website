"""MIME preservation and opaque attached-message tests. Written, not run here."""

from email.message import EmailMessage

from app.modules.mail.mime_parse import parse_message


def test_html_only_message_is_retained_and_text_can_be_derived():
    message = EmailMessage()
    message["From"] = "Contracts <contracts@example.test>"
    message["To"] = "staff@example.test"
    message["Subject"] = "Agreement"
    message.add_alternative('<h1>Agreement</h1><p>Sign here</p>', subtype="html")

    parsed = parse_message(
        message.as_bytes(),
        blocked_extensions=set(),
        max_attachment_bytes=1024 * 1024,
        max_html_bytes=1024 * 1024,
        max_text_bytes=1024 * 1024,
    )

    assert parsed.html_body is not None
    assert "Agreement" in parsed.html_body
    assert parsed.text_body == ""
    assert parsed.from_address == "contracts@example.test"


def test_message_rfc822_is_one_eml_attachment_not_flattened():
    inner = EmailMessage()
    inner["From"] = "sender@example.test"
    inner["Subject"] = "Nested contract"
    inner.set_content("private inner body")

    outer = EmailMessage()
    outer["From"] = "forwarder@example.test"
    outer["Subject"] = "Forwarded"
    outer.set_content("See attached message")
    outer.add_attachment(inner, subtype="rfc822")

    parsed = parse_message(
        outer.as_bytes(),
        blocked_extensions=set(),
        max_attachment_bytes=1024 * 1024,
        max_html_bytes=1024 * 1024,
        max_text_bytes=1024 * 1024,
    )

    eml = [item for item in parsed.attachments if item.content_type == "message/rfc822"]
    assert len(eml) == 1
    assert eml[0].filename.endswith(".eml")
    assert b"private inner body" in eml[0].data
    assert "private inner body" not in parsed.text_body


def test_blocked_attachment_becomes_metadata_only_placeholder():
    message = EmailMessage()
    message["From"] = "sender@example.test"
    message["Subject"] = "Unsafe"
    message.set_content("See file")
    message.add_attachment(b"MZpayload", maintype="application", subtype="octet-stream", filename="invoice.pdf.exe")

    parsed = parse_message(
        message.as_bytes(),
        blocked_extensions={"exe"},
        max_attachment_bytes=1024 * 1024,
        max_html_bytes=1024 * 1024,
        max_text_bytes=1024 * 1024,
    )

    attachment = parsed.attachments[0]
    assert attachment.blocked_reason == "extension:exe"
    assert attachment.data == b""
    assert attachment.size_bytes > 0
    assert len(attachment.sha256) == 64


def test_cid_image_outside_multipart_related_is_marked_inline():
    message = EmailMessage()
    message["From"] = "sender@example.test"
    message["Subject"] = "Letterhead"
    message.set_content("Plain fallback")
    message.add_alternative('<p>Letter</p><img src="cid:logo@example.test">', subtype="html")
    image = EmailMessage()
    image.set_content(
        b"\x89PNG\r\n\x1a\nimage-bytes",
        maintype="image",
        subtype="png",
        cte="base64",
    )
    image["Content-ID"] = "<logo@example.test>"
    image["Content-Disposition"] = 'attachment; filename="letterhead.png"'
    message.attach(image)

    parsed = parse_message(
        message.as_bytes(),
        blocked_extensions=set(),
        max_attachment_bytes=1024 * 1024,
        max_html_bytes=1024 * 1024,
        max_text_bytes=1024 * 1024,
    )

    inline = [item for item in parsed.attachments if item.content_id == "logo@example.test"]
    assert len(inline) == 1
    assert inline[0].disposition == "inline"
