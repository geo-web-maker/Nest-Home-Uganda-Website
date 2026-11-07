"""Phone numbers (spec 6.4). Pure functions, no I/O. Uganda forms are understood natively; other countries need +code.

Accepted: 07xx xxx xxx, +2567xx xxx xxx, 2567xxxxxxxx, and 03xx landlines.
Stored: the original text and a normalised +256 value.
"""

import re

_UG_RE = re.compile(r"^(?:\+?256|0)[37]\d{8}$")


def _compact(raw: str) -> str:
    return re.sub(r"[\s\-().]", "", raw.strip())


def normalise_e164(raw: str) -> str | None:
    """'0787 499 988' -> '+256787499988'. None if it is not a valid Uganda number."""
    compact = _compact(raw)
    if not _UG_RE.match(compact):
        return None
    national = compact.removeprefix("+").removeprefix("256").removeprefix("0")
    return "+256" + national


_INTL_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def normalise_phone(raw: str) -> str | None:
    """Any real-world number as E.164: Uganda local forms as before, anything else needs its +country code.

    '0787 499 988' -> '+256787499988'; '+44 20 7946 0958' -> '+442079460958'; None if neither.
    """
    uganda = normalise_e164(raw)
    if uganda:
        return uganda
    compact = _compact(raw)
    return compact if _INTL_RE.match(compact) else None


def is_mobile(e164: str) -> bool:
    """SMS can only reach mobiles (07...), not 03 landlines."""
    return e164.startswith("+2567") and len(e164) == 13


def to_local(e164: str) -> str:
    """'+256787499988' -> '0787499988' (the format MamboSMS wants, BUILDER_INSTRUCTIONS 13.1)."""
    return "0" + e164.removeprefix("+256")


def mask(e164_or_local: str) -> str:
    """Log-safe hint: keep the first four and last three characters."""
    value = e164_or_local
    if len(value) <= 7:
        return "***"
    return value[:4] + "***" + value[-3:]
