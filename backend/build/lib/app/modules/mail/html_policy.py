"""Safe, deterministic HTML handling for received and composed mail.

This module intentionally uses only the Python standard library. It keeps the server-side
policy usable in the backend's isolated deployment root without native HTML-cleaner wheels.
The policy JSON is mirrored from shared/mail-rich/policy/mail-html-policy.json.
"""

from __future__ import annotations

import base64
import html
import json
import re
import uuid
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

_POLICY_PATH = Path(__file__).with_name("html_policy.json")
try:
    POLICY: dict[str, Any] = json.loads(_POLICY_PATH.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):  # A broken policy must fail closed, not break mail.
    POLICY = {
        "version": 1,
        "max_depth": 80,
        "max_nodes": 12000,
        "max_html_kb": 1024,
        "allowed_tags": ["p", "br", "b", "strong", "em", "i", "ul", "ol", "li", "pre"],
        "drop_content_tags": ["script", "style", "iframe", "object", "svg", "form"],
        "void_tags": ["br"],
        "global_attributes": ["title", "dir", "align"],
        "tag_attributes": {"a": ["href", "title"], "img": ["src", "alt", "width", "height"]},
        "allowed_style_properties": ["color", "background-color", "font-weight", "font-style"],
        "link_schemes": ["http", "https", "mailto", "tel"],
        "image_schemes": ["cid", "data"],
        "inline_image_mime_types": ["image/png", "image/jpeg", "image/gif", "image/webp"],
    }

POLICY_VERSION = int(POLICY.get("version", 1))
_ALLOWED_TAGS = frozenset(POLICY["allowed_tags"])
_DROP_TAGS = frozenset(POLICY["drop_content_tags"])
_VOID_TAGS = frozenset(POLICY["void_tags"])
_GLOBAL_ATTRS = frozenset(POLICY["global_attributes"])
_TAG_ATTRS = {key: frozenset(value) for key, value in POLICY["tag_attributes"].items()}
_STYLE_PROPERTIES = frozenset(POLICY["allowed_style_properties"])
_LINK_SCHEMES = frozenset(POLICY["link_schemes"])
_MAX_DEPTH = int(POLICY["max_depth"])
_MAX_NODES = int(POLICY["max_nodes"])
_DANGEROUS_STYLE = re.compile(
    r"(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding)",
    re.IGNORECASE,
)
_CID_RE = re.compile(r"(?i)cid:([^\s\"'<>]+)")
_DATA_IMAGE_RE = re.compile(
    r"(?is)data:(image/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)"
)


@dataclass(frozen=True)
class SanitizeResult:
    html: str
    notes: dict[str, Any]


@dataclass(frozen=True)
class ExtractedImage:
    content_id: str
    filename: str
    content_type: str
    data: bytes


def _notes() -> dict[str, Any]:
    return {
        "removed_tags": {},
        "removed_attributes": 0,
        "removed_style_properties": 0,
        "blocked_remote_images": 0,
        "truncated": False,
        "depth_exceeded": False,
        "failed": False,
        "removed_css_rules": 0,
        "missing_inline_image": 0,
    }


def _escaped_pre(value: str) -> str:
    return f"<pre>{html.escape(value, quote=False)}</pre>"


def _safe_url(value: str, *, image: bool) -> bool:
    value = value.strip()
    if not value or any(ord(char) < 0x20 for char in value):
        return False
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    if not scheme:
        return value.startswith(("/", "#", "?", "./", "../"))
    if image:
        if scheme == "cid":
            return bool(parts.path) and not any(char in parts.path for char in "\\\r\n")
        if scheme == "data":
            match = re.match(r"(?is)^data:(image/(?:png|jpeg|gif|webp));base64,", value)
            return bool(match)
        return scheme in {"http", "https"}
    return scheme in _LINK_SCHEMES


def _style_declarations(value: str, notes: dict[str, Any]) -> str:
    kept: list[str] = []
    for declaration in value.split(";"):
        if ":" not in declaration:
            if declaration.strip():
                notes["removed_style_properties"] += 1
            continue
        name, raw_value = declaration.split(":", 1)
        prop = name.strip().lower()
        val = " ".join(raw_value.strip().split())
        if (
            prop not in _STYLE_PROPERTIES
            or prop.startswith("mso-")
            or not val
            or _DANGEROUS_STYLE.search(val)
            or "\\" in val
            or "<" in val
            or ">" in val
            or len(val) > 200
        ):
            notes["removed_style_properties"] += 1
            continue
        kept.append(f"{prop}:{val}")
    return ";".join(kept)


def _parse_css_rules(source: str, notes: dict[str, Any]) -> dict[str, list[str]]:
    """Accept only simple tag, .class, #id and tag.class selectors."""
    rules: dict[str, list[str]] = {}
    for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", source):
        selectors, declarations = match.groups()
        safe_declarations = _style_declarations(declarations, notes)
        if not safe_declarations:
            continue
        for selector in selectors.split(","):
            selector = selector.strip().lower()
            if re.fullmatch(r"[a-z][a-z0-9-]*|\.[a-z0-9_-]+|#[a-z0-9_-]+|[a-z][a-z0-9-]*\.[a-z0-9_-]+", selector):
                rules.setdefault(selector, []).append(safe_declarations)
            else:
                notes["removed_css_rules"] += 1
    # @media/@supports and all unsupported at-rules are deliberately ignored.
    return rules


class _StyleCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.styles: list[str] = []
        self.in_style = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "style":
            self.in_style = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "style":
            self.in_style = False

    def handle_data(self, data: str) -> None:
        if self.in_style:
            self.styles.append(data)


class _SafeHTMLParser(HTMLParser):
    def __init__(
        self,
        notes: dict[str, Any],
        *,
        inline_styles: bool,
        block_remote_images: bool,
        css_rules: dict[str, list[str]],
    ) -> None:
        super().__init__(convert_charrefs=True)
        self.notes = notes
        self.inline_styles = inline_styles
        self.block_remote_images = block_remote_images
        self.css_rules = css_rules
        self.output: list[str] = []
        self.stack: list[str] = []
        self.drop_stack: list[str] = []
        self.nodes = 0
        self.depth_exceeded = False

    def _removed(self, tag: str) -> None:
        bucket = self.notes["removed_tags"]
        bucket[tag] = int(bucket.get(tag, 0)) + 1

    def _matching_styles(self, tag: str, attrs: dict[str, str]) -> str:
        matches: list[str] = []
        for selector in (tag, f"#{attrs.get('id', '')}" if attrs.get("id") else ""):
            if selector:
                matches.extend(self.css_rules.get(selector, []))
        classes = attrs.get("class", "").split()
        for class_name in classes:
            matches.extend(self.css_rules.get(f".{class_name.lower()}", []))
            matches.extend(self.css_rules.get(f"{tag}.{class_name.lower()}", []))
        return ";".join(matches)

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self.nodes += 1
        if self.nodes > _MAX_NODES or len(self.stack) >= _MAX_DEPTH:
            self.depth_exceeded = True
            return
        if self.drop_stack:
            if tag in _DROP_TAGS:
                self.drop_stack.append(tag)
            return
        if tag in _DROP_TAGS:
            self._removed(tag)
            self.drop_stack.append(tag)
            return
        if tag not in _ALLOWED_TAGS:
            self._removed(tag)
            return

        attrs = {name.lower(): (value or "") for name, value in attrs_list}
        safe_attrs: dict[str, str] = {}
        allowed_for_tag = _TAG_ATTRS.get(tag, frozenset())
        for name, value in attrs.items():
            if name.startswith("on") or name.startswith("data-") or name in {"srcset", "xmlns"}:
                self.notes["removed_attributes"] += 1
                continue
            if name == "style":
                if self.inline_styles:
                    style = _style_declarations(value, self.notes)
                    if style:
                        safe_attrs["style"] = style
                else:
                    self.notes["removed_attributes"] += 1
                continue
            if name not in _GLOBAL_ATTRS and name not in allowed_for_tag:
                self.notes["removed_attributes"] += 1
                continue
            if name in {"href", "src"}:
                if not _safe_url(value, image=(tag == "img" and name == "src")):
                    self.notes["removed_attributes"] += 1
                    continue
                if tag == "img" and name == "src" and self.block_remote_images:
                    if urlsplit(value).scheme.lower() in {"http", "https"}:
                        safe_attrs["data-remote-src"] = value
                        self.notes["blocked_remote_images"] += 1
                        continue
            if name in {"width", "height", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "size", "span"}:
                if not re.fullmatch(r"\d{1,5}", value.strip()):
                    self.notes["removed_attributes"] += 1
                    continue
            if name == "target":
                value = "_blank" if value == "_blank" else "_self"
            if name == "rel" and tag == "a":
                value = "noopener noreferrer nofollow"
            if name == "dir" and value.lower() not in {"ltr", "rtl", "auto"}:
                self.notes["removed_attributes"] += 1
                continue
            value_limit = 2_000_000 if name == "src" and value.lower().startswith("data:image/") else 2048
            safe_attrs[name] = value[:value_limit]

        if tag == "a" and safe_attrs.get("href"):
            safe_attrs["target"] = "_blank"
            safe_attrs["rel"] = "noopener noreferrer nofollow"
        if tag == "img" and "src" not in safe_attrs and "data-remote-src" not in safe_attrs:
            # A source-less image is not useful and may have been deliberately malformed.
            self._removed("img_without_safe_source")
            return

        if self.inline_styles:
            derived = self._matching_styles(tag, attrs)
            if derived:
                combined = ";".join(filter(None, [derived, safe_attrs.get("style", "")]))
                filtered = _style_declarations(combined, self.notes)
                if filtered:
                    safe_attrs["style"] = filtered
        rendered = "".join(
            f' {name}="{html.escape(value, quote=True)}"'
            for name, value in sorted(safe_attrs.items())
        )
        self.output.append(f"<{tag}{rendered}>")
        if tag not in _VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in _VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.drop_stack:
            if tag == self.drop_stack[-1]:
                self.drop_stack.pop()
            elif tag in self.drop_stack:
                while self.drop_stack:
                    removed = self.drop_stack.pop()
                    if removed == tag:
                        break
            return
        if tag not in _ALLOWED_TAGS or tag in _VOID_TAGS:
            return
        if tag not in self.stack:
            return
        while self.stack:
            current = self.stack.pop()
            self.output.append(f"</{current}>")
            if current == tag:
                break

    def handle_data(self, data: str) -> None:
        self.nodes += 1
        if self.nodes > _MAX_NODES:
            self.depth_exceeded = True
            return
        if not self.drop_stack:
            self.output.append(html.escape(data, quote=False))

    def handle_entityref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&#{name};"))

    def close(self) -> None:
        super().close()
        if not self.drop_stack:
            while self.stack:
                self.output.append(f"</{self.stack.pop()}>")


def sanitize_html(
    value: str | None,
    *,
    inline_styles: bool = True,
    block_remote_images: bool = True,
    max_bytes: int | None = None,
) -> SanitizeResult:
    """Sanitise untrusted mail HTML; malformed input always degrades to escaped text."""
    source = str(value or "")
    notes = _notes()
    byte_limit = max_bytes or int(POLICY.get("max_html_kb", 1024)) * 1024
    encoded = source.encode("utf-8", errors="replace")
    if len(encoded) > byte_limit:
        source = encoded[:byte_limit].decode("utf-8", errors="ignore")
        # Avoid leaving a partial tag at the truncation boundary.
        last_open = source.rfind("<")
        last_close = source.rfind(">")
        if last_open > last_close:
            source = source[:last_open]
        notes["truncated"] = True

    try:
        collector = _StyleCollector()
        collector.feed(source)
        collector.close()
        css_rules = _parse_css_rules("\n".join(collector.styles), notes) if inline_styles else {}
        parser = _SafeHTMLParser(
            notes,
            inline_styles=inline_styles,
            block_remote_images=block_remote_images,
            css_rules=css_rules,
        )
        parser.feed(source)
        parser.close()
        if parser.depth_exceeded:
            notes["depth_exceeded"] = True
            return SanitizeResult(_escaped_pre(source), notes)
        return SanitizeResult("".join(parser.output), notes)
    except Exception:
        notes["failed"] = True
        return SanitizeResult(_escaped_pre(source), notes)


def block_remote_images(value: str) -> tuple[str, int]:
    result = sanitize_html(value, block_remote_images=True)
    return result.html, int(result.notes.get("blocked_remote_images", 0))


class _TextExtractor(HTMLParser):
    _BLOCKS = {
        "address", "article", "blockquote", "dd", "div", "dl", "dt", "h1", "h2",
        "h3", "h4", "h5", "h6", "hr", "li", "ol", "p", "pre", "section", "table",
        "tbody", "tfoot", "thead", "tr", "ul",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[tuple[str, int]] = []
        self.blockquotes = 0
        self.list_stack: list[tuple[str, int]] = []
        self.table_cell = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "a" and values.get("href"):
            self.links.append((values["href"], len(self.parts)))
        elif tag == "blockquote":
            self.blockquotes += 1
            self.parts.append("\n")
        elif tag == "ul":
            self.list_stack.append(("ul", 0))
        elif tag == "ol":
            self.list_stack.append(("ol", 0))
        elif tag == "li":
            if self.list_stack:
                kind, number = self.list_stack[-1]
                number += 1
                self.list_stack[-1] = (kind, number)
                self.parts.append(f"\n{number}. " if kind == "ol" else "\n- ")
        elif tag in {"td", "th"}:
            if self.table_cell:
                self.parts.append("\t")
            self.table_cell = True
        elif tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.links:
            href, start = self.links.pop()
            label = "".join(self.parts[start:]).strip()
            if label and href and label != href:
                self.parts.append(f" ({href})")
        elif tag == "blockquote":
            self.blockquotes = max(0, self.blockquotes - 1)
            self.parts.append("\n")
        elif tag in {"ul", "ol"} and self.list_stack:
            self.list_stack.pop()
        elif tag in {"td", "th"}:
            self.parts.append("\t")
            self.table_cell = False
        elif tag in self._BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        text = data
        if self.blockquotes:
            text = re.sub(r"(?m)^", "> ", text)
        self.parts.append(text)


def html_to_text(value: str | None) -> str:
    parser = _TextExtractor()
    try:
        parser.feed(str(value or ""))
        parser.close()
    except Exception:
        return html.unescape(re.sub(r"<[^>]*>", " ", str(value or ""))).strip()
    result = "".join(parser.parts)
    result = re.sub(r" +", " ", result)
    result = re.sub(r" *\n *", "\n", result)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def make_snippet(text: str, limit: int = 160) -> str:
    cleaned = " ".join(str(text or "").split())
    if limit <= 0:
        return ""
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def extract_data_images(
    value: str,
    *,
    max_each: int,
    allowed: set[str],
) -> tuple[str, list[ExtractedImage]]:
    """Extract supported data:image URIs and replace them with fresh CID references."""
    extracted: list[ExtractedImage] = []

    def replace(match: re.Match[str]) -> str:
        content_type = match.group(1).lower()
        if content_type not in allowed:
            return ""
        try:
            data = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
        except (ValueError, base64.binascii.Error):
            return ""
        if len(data) > max_each:
            return ""
        content_id = uuid.uuid4().hex
        extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}[content_type]
        extracted.append(ExtractedImage(content_id, f"inline-{content_id[:8]}{extension}", content_type, data))
        return f"cid:{content_id}"

    return _DATA_IMAGE_RE.sub(replace, value), extracted


def compose_final_html(*, body_html: str, quoted_html: str | None) -> str:
    body = str(body_html or "")
    quote = str(quoted_html or "")
    if not quote:
        return body
    return f'{body}<div class="mail-quoted-content">{quote}</div>'


def remove_missing_cids(value: str, valid_content_ids: set[str]) -> tuple[str, int]:
    missing = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal missing
        if match.group(1).lower() not in valid_content_ids:
            missing += 1
            return ""
        return match.group(0)

    return _CID_RE.sub(replace, value), missing


def resolve_cid_images(value: str, content_id_to_data_uri: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        return content_id_to_data_uri.get(match.group(1).lower(), match.group(0))

    return _CID_RE.sub(replace, value)
