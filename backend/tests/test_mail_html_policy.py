"""Tests for safe rich mail HTML. Written, not run here."""

import json
from pathlib import Path

from app.modules.mail.html_policy import html_to_text, make_snippet, sanitize_html


def test_html_policy_preserves_email_structure_and_safe_inline_styles():
    result = sanitize_html(
        '<table style="border-collapse:collapse"><tr><td style="color:#123456">Hi</td></tr></table>'
    )
    assert "<table" in result.html
    assert "<tr>" in result.html
    assert "<td" in result.html
    assert "color:#123456" in result.html


def test_html_policy_removes_active_content_and_event_handlers():
    result = sanitize_html(
        '<p onclick="steal()">Hello</p><script>bad()</script>'
        '<img src="https://tracker.invalid/pixel" onerror="bad()">'
    )
    assert "<p>Hello</p>" in result.html
    assert "script" not in result.html
    assert "onclick" not in result.html
    assert "onerror" not in result.html
    assert 'data-remote-src="https://tracker.invalid/pixel"' in result.html
    assert result.notes["blocked_remote_images"] == 1


def test_html_policy_rejects_unsafe_css_and_keeps_safe_colour():
    result = sanitize_html(
        '<p style="color: navy; background-image: url(https://bad); behavior: url(x)">Text</p>'
    )
    assert "color:navy" in result.html
    assert "url(" not in result.html
    assert result.notes["removed_style_properties"] >= 2


def test_html_to_text_keeps_lists_tables_links_and_quotes():
    text = html_to_text(
        '<ol><li>One</li><li>Two</li></ol><table><tr><td>A</td><td>B</td></tr></table>'
        '<a href="https://example.test">Example</a><blockquote>Quoted</blockquote>'
    )
    assert "1. One" in text
    assert "2. Two" in text
    assert "A" in text and "B" in text
    assert "Example (https://example.test)" in text
    assert "> Quoted" in text


def test_snippet_is_bounded_and_collapses_whitespace():
    assert make_snippet(" a\n b ") == "a b"
    assert len(make_snippet("x" * 500, limit=40)) == 40


def test_backend_policy_matches_shared_policy_file():
    repository_root = Path(__file__).resolve().parents[2]
    shared = json.loads((repository_root / "shared/mail-rich/policy/mail-html-policy.json").read_text())
    backend = json.loads(
        (repository_root / "backend/app/modules/mail/html_policy.json").read_text()
    )
    assert backend == shared
