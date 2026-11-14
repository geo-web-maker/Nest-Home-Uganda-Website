from __future__ import annotations

import re

from app.modules.agreements import blocks, messages


def test_mark_is_the_bloomwell_logo_and_old_palette_is_gone() -> None:
    assert blocks.MARK_SVG.startswith("<svg") and blocks.MARK_SVG.count("<path") == 5
    for old in ("#123524", "#C79A3B", "#18784D", "#E9DDB8"):
        assert old.lower() not in blocks.MARK_SVG.lower()
    assert blocks.FOREST == "#0B2E2A" and blocks.GOLD == "#F8991E"


def test_email_header_carries_the_logo_image() -> None:
    stage_key, _channel = next(key for key in messages.DEFAULTS if key[1] == "email")
    template = messages.DEFAULTS[(stage_key, "email")]
    link = "https://www.bhcug.com/agreements/x"
    try:
        _subject, html_body, _plain = messages.render_email(stage_key, template, {"link": link})
    except ValueError:
        raise AssertionError("render_email should accept a link for an email stage")
    assert 'src="https://www.bhcug.com/brand/bloomwell-mark-ondark-120.png"' in html_body
    assert "#123524" not in html_body and "#C79A3B" not in html_body
