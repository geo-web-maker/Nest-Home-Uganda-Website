"""LocalizedText and per-field language fallback (spec 8.1 and 17.2)."""

import re
from typing import Annotated

from fastapi import Header, Query
from pydantic import AfterValidator

DEFAULT_LANG = "en"
_LANG_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
_MAX_TEXT = 5000


def _check_localized(value: dict[str, str]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for lang, text in value.items():
        if not _LANG_RE.match(lang):
            raise ValueError(f"'{lang}' is not a valid language code")
        text = text.strip()
        if len(text) > _MAX_TEXT:
            raise ValueError("text is too long")
        if text:
            cleaned[lang] = text
    return cleaned


LocalizedText = Annotated[dict[str, str], AfterValidator(_check_localized)]


def resolve(text: dict[str, str] | None, lang: str) -> str:
    """Return text for lang, falling back to English per field, else empty."""
    if not text:
        return ""
    return text.get(lang) or text.get(DEFAULT_LANG) or ""


def pick_language(query_lang: str | None, accept_language: str | None) -> str:
    """?lang wins, then the first Accept-Language tag, then English."""
    if query_lang and _LANG_RE.match(query_lang):
        return query_lang.split("-")[0].lower()
    if accept_language:
        first = accept_language.split(",")[0].split(";")[0].strip()
        if first and _LANG_RE.match(first):
            return first.split("-")[0].lower()
    return DEFAULT_LANG


def language(
    lang: Annotated[str | None, Query(max_length=16)] = None,
    accept_language: Annotated[str | None, Header(max_length=200)] = None,
) -> str:
    """FastAPI dependency for public endpoints (spec 9.1)."""
    return pick_language(lang, accept_language)
