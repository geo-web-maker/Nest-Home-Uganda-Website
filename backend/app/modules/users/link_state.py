"""Invite and reset links: say exactly why a link cannot be used.

Same idea as the agreement links: tidy common copy/paste damage, give each failure its own
answer and its own short support reference, and never let a newer message break an older
invite that is still valid.
"""
from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import unquote

from app.core.errors import ValidationFailed

STATE_CODES = {
    "malformed": "S1", "not_found": "S2", "used": "S3", "expired": "S4",
    "superseded": "S5", "wrong_kind": "S6", "inactive": "S7",
}
STATE_MESSAGES = {
    "malformed": "This does not look like a complete link. Please open the link exactly as we sent it.",
    "not_found": "We could not find this link. Please use the newest email or SMS we sent you.",
    "used": "This link was already used. If you set your password, you can sign in now.",
    "expired": "This link has expired. Ask an administrator to send you a new one.",
    "superseded": "This link was replaced by a newer one. Please open the most recent email or SMS.",
    "wrong_kind": "This link is for a different step. Please open the most recent email or SMS.",
    "inactive": "This account is not active. Please contact an administrator.",
}

_TOKEN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")
_INVISIBLE = re.compile("[\u200b\u200c\u200d\u2060\ufeff\u00a0]")
_TRIM = " \t\r\n.,;:!?()[]<>\"'\u201c\u201d\u2018\u2019"


def clean_token(raw: str | None) -> str | None:
    """Undo copy/paste damage (%20, spaces, line breaks from SMS wrapping, zero-width
    characters, a whole pasted URL). Returns None when nothing token-shaped is left."""
    text = _INVISIBLE.sub("", unquote(raw or ""))
    found = re.search(r"token=([^&#\s]+)", text)
    if found:
        text = found.group(1)
    text = re.sub(r"\s+", "", text.strip().strip(_TRIM))
    return text if _TOKEN.match(text) else None


class LinkProblem(ValidationFailed):
    """422 with fields.token == "invalid" (older clients) plus state and a support ref."""

    def __init__(self, state: str, fingerprint: str = "") -> None:
        super().__init__(
            STATE_MESSAGES[state],
            {"token": "invalid", "state": state, "ref": f"{STATE_CODES[state]}-{fingerprint or '------'}"},
        )
        self.state = state


def diagnose(reset, user, now: datetime, expected_purpose: str | None) -> str | None:
    """Return the reason this link cannot be used, or None when it can."""
    kind = getattr(reset, "purpose", "reset")
    if expected_purpose is not None and kind != expected_purpose:
        return "wrong_kind"
    if getattr(reset, "superseded_at", None) is not None:
        return "superseded"
    if reset.used_at is not None:
        return "used"
    if reset.expires_at <= now:
        return "expired"
    if user is None or not user.is_active:
        return "inactive"
    return None
