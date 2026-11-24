from __future__ import annotations

from app.core.email_layout import render_branded_email


def test_branded_email_escapes_text_and_drops_unsafe_links() -> None:
    html_body, plain = render_branded_email(
        paragraphs="Hello <script>alert(1)</script>", button_label="Go", link="javascript:alert(1)"
    )
    assert "<script>" not in html_body and "&lt;script&gt;" in html_body
    assert "javascript:" not in html_body
    assert "Hello <script>alert(1)</script>" in plain


def test_branded_email_button_link_is_escaped_and_repeated_in_plain_text() -> None:
    html_body, plain = render_branded_email(paragraphs=["a", "b"], button_label="Go", link="https://bhcug.com/x?a=1&b=2")
    assert 'href="https://bhcug.com/x?a=1&amp;b=2"' in html_body
    assert "Go: https://bhcug.com/x?a=1&b=2" in plain


def test_branded_email_carries_logo_header_and_footer() -> None:
    html_body, plain = render_branded_email(paragraphs="Hi", heading="Title")
    assert "bloomwell-mark-ondark-120.png" in html_body and "Title" in html_body
    assert "info@bhcug.com" in html_body and "info@bhcug.com" in plain


def test_letterhead_keeps_sanitised_composer_html_unescaped() -> None:
    from app.modules.mail.outbox import apply_letterhead

    html_body, plain = apply_letterhead("<p>Dear <b>Carol</b></p>", "Dear Carol")
    assert "<p>Dear <b>Carol</b></p>" in html_body and "bloomwell-mark-ondark-120.png" in html_body
    assert "Dear Carol" in plain and "info@bhcug.com" in plain


def test_letterhead_wraps_a_plain_text_message_and_escapes_it() -> None:
    from app.modules.mail.outbox import apply_letterhead

    html_body, plain = apply_letterhead(None, "Hello <b>there</b>\nSecond line")
    assert "&lt;b&gt;there&lt;/b&gt;" in html_body and "Second line" in html_body
    assert "Hello <b>there</b>" in plain
