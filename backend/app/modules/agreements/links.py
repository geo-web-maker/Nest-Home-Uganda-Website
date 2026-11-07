"""Public agreement links: one stable, short, typo-checked code per agreement.

Design rules
* A link is DERIVED (HMAC of the agreement id + a generation number), never random per
  send. Sending, resending, reminders and staff edits therefore all use the SAME link, so a
  newer message can no longer kill the link in an older message.
* The generation number only changes when staff explicitly revoke and regenerate.
* Only the SHA-256 of the canonical code is stored; the code is re-derivable on demand
  (admin "Copy link") without storing a usable secret in the database.
* Codes are 16 characters, Crockford base32, last character is a checksum. Case, hyphens,
  spaces and look-alike letters (O/0, I/L/1) do not matter. A truncated or mistyped code is
  detected WITHOUT touching the database, so "typed wrongly" and "never existed" and
  "expired" and "already signed" each get their own answer and their own support ref.
* Older 43-character links already in inboxes keep working until the agreement closes.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from urllib.parse import unquote
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.core.errors import AppError, NotFound

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford: no I, L, O, U
_LEGACY = re.compile(r"^[A-Za-z0-9_-]{43}$")
_TRIM = " \t\r\n.,;:!?()[]<>\"'\u201c\u201d\u2018\u2019"

# Support reference codes (shown on the client screen, decoded in docs/AGREEMENT_LINKS.md)
STATE_CODES = {
    "malformed": "L1", "mistyped": "L2", "not_found": "L3", "superseded": "L4",
    "expired": "L5", "signed": "L6", "revoked": "L7", "closed": "L8",
}
STATE_STATUS = {"malformed": 404, "mistyped": 404, "not_found": 404, "superseded": 410,
                "expired": 410, "signed": 410, "revoked": 410, "closed": 410}
STATE_MESSAGES = {
    "malformed": "This does not look like a complete agreement link. Please open the link exactly as we sent it.",
    "mistyped": "This link looks incomplete or has a mistyped character. Please open the link exactly as we sent it.",
    "not_found": "We could not find an agreement for this link.",
    "superseded": "This link has been replaced by a newer one.",
    "expired": "This agreement link has expired.",
    "signed": "This agreement has already been signed. Nothing more is needed.",
    "revoked": "This link was withdrawn by Bloomwell.",
    "closed": "This agreement is not open for signing right now.",
}

Purpose = Literal["sign", "view"]


def _check(payload: str) -> str:
    return ALPHABET[hashlib.sha256(("chk:" + payload).encode()).digest()[0] % 32]


def derive(secret: bytes, agreement_id: str, generation: int, purpose: Purpose = "sign") -> str:
    """Canonical 16-character code (no hyphens, upper case)."""
    digest = hmac.new(secret, f"link:{purpose}:{agreement_id}:{generation}".encode(), hashlib.sha256).digest()
    n = int.from_bytes(digest[:10], "big") >> 5  # 75 bits
    payload = "".join(ALPHABET[(n >> (5 * i)) & 31] for i in range(14, -1, -1))
    return payload + _check(payload)


def display(canonical: str) -> str:
    """Human form, for example 7KQM-3XPD-9F2R-WT4H."""
    return "-".join(canonical[i:i + 4] for i in range(0, len(canonical), 4)) if len(canonical) == 16 else canonical


def link_hash(canonical: str) -> str:
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def link_id(canonical: str) -> str:
    """Six-character fingerprint of a link. Safe to show; cannot be turned back into the link."""
    return link_hash(canonical)[:6].upper()


@dataclass(frozen=True)
class Parsed:
    kind: Literal["short", "legacy", "mistyped", "malformed"]
    canonical: str = ""


_INVISIBLE = re.compile("[\u200b\u200c\u200d\u2060\ufeff\u00a0]")


def clean(raw: str | None) -> str:
    """Undo common copy/paste damage: %20, spaces, line breaks, zero-width characters and a
    pasted full URL (keeps only what follows /a/ or /agreement/)."""
    text = unquote(raw or "")
    text = _INVISIBLE.sub("", text)
    m = re.search(r"/(?:a|agreement)/([^?#]*)", text)
    if m:
        text = m.group(1)
    return text.strip().strip(_TRIM)


def parse(raw: str | None) -> Parsed:
    text = clean(raw)
    text = re.sub(r"\s+", "", text)
    if not text or len(text) > 128:
        return Parsed("malformed")
    if _LEGACY.match(text) and len(text.replace("-", "")) != 16:
        return Parsed("legacy", text)  # case-sensitive, exactly as issued
    compact = re.sub(r"[^A-Za-z0-9]", "", text).upper()
    compact = compact.replace("O", "0").replace("I", "1").replace("L", "1")
    if not compact or any(ch not in ALPHABET for ch in compact):
        return Parsed("malformed")
    if len(compact) != 16:
        return Parsed("mistyped") if 8 <= len(compact) <= 22 else Parsed("malformed")
    if _check(compact[:15]) != compact[15]:
        return Parsed("mistyped")
    return Parsed("short", compact)


class LinkError(NotFound):
    """Distinct, machine-readable failure for a public agreement link.

    Subclasses NotFound so existing `except NotFound` handling keeps working."""

    def __init__(self, state: str, *, link_id_value: str = "", release: str = "dev") -> None:
        ref = f"{STATE_CODES[state]}-{link_id_value or '------'}"
        AppError.__init__(
            self, f"link_{state}", STATE_MESSAGES[state], STATE_STATUS[state],
            fields={"state": state, "ref": ref, "link_id": link_id_value, "release": release},
            headers={"Cache-Control": "no-store"},
        )
        self.state = state


@dataclass
class Resolution:
    doc: object
    purpose: Purpose
    canonical: str
    link_id: str
    corrected: bool = False


def within_one_edit(a: str, b: str) -> bool:
    """True when a and b differ by at most one substituted, missing or extra character."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    i = 0
    while i < len(short) and short[i] == long_[i]:
        i += 1
    return short[i:] == long_[i + 1:]


async def _near_match(compact: str, agreement_model, secret: bytes) -> str | None:
    """Copy/paste repair: if the code is within one character of exactly ONE open
    agreement's current link, use that link. Ambiguous or no match returns None."""
    if not 14 <= len(compact) <= 18:
        return None
    docs = await agreement_model.find({"status": {"$in": ["sent", "client_in_progress"]}}).to_list()
    hits = {c for d in docs for c in [derive(secret, str(d.id), d.link_generation, "sign")]
            if within_one_edit(compact, c)}
    return hits.pop() if len(hits) == 1 else None


def _now() -> datetime:
    return datetime.now(UTC)


async def resolve(raw: str, agreement_model, release: str = "dev", secret: bytes | None = None) -> Resolution:
    """Find the agreement for a link or raise LinkError saying exactly why not."""
    parsed = parse(raw)
    corrected = False
    if parsed.kind in {"malformed", "mistyped"}:
        fixed = None
        if secret is not None and parsed.kind == "mistyped":
            fixed = await _near_match(re.sub(r"[^A-Za-z0-9]", "", clean(raw)).upper()
                                      .replace("O", "0").replace("I", "1").replace("L", "1"),
                                      agreement_model, secret)
        if fixed is None:
            raise LinkError(parsed.kind, release=release)
        parsed, corrected = Parsed("short", fixed), True
    canonical = parsed.canonical
    digest = link_hash(canonical)
    fp = digest[:6].upper()

    def fail(state: str) -> LinkError:
        return LinkError(state, link_id_value=fp, release=release)

    doc = await agreement_model.find_one(agreement_model.token_hash == digest)
    purpose: Purpose = "sign"
    if doc is None:
        doc = await agreement_model.find_one(agreement_model.view_token_hash == digest)
        purpose = "view"
    if doc is None:
        doc = await agreement_model.find_one({"link_history.hash": digest})
        if doc is None:
            raise fail("not_found")
        tomb = next((t for t in doc.link_history if t.hash == digest), None)
        purpose = "view" if tomb and tomb.purpose == "view" else "sign"
        reason = tomb.reason if tomb else "revoked"
        # A superseded link stays valid while the agreement is open: only an explicit
        # revoke, expiry, signing or voiding ends it.
        if reason != "superseded" or doc.status not in {"sent", "client_in_progress"}:
            raise fail({"superseded": "closed"}.get(reason, reason))
    if purpose == "view":
        if doc.status != "completed":
            raise fail("closed")
        return Resolution(doc, "view", canonical, fp, corrected)
    if doc.status == "completed" or doc.status == "client_signed":
        raise fail("signed")
    if doc.status == "voided":
        raise fail("revoked")
    if doc.status == "expired" or (doc.token_expires_at and doc.token_expires_at <= _now()):
        raise fail("expired")
    if doc.status not in {"sent", "client_in_progress"}:
        raise fail("closed")
    if not doc.token_expires_at:
        raise fail("expired")
    return Resolution(doc, "sign", canonical, fp, corrected)
