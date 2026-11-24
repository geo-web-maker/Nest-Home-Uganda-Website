"""The one Bloomwell email layout.

Every email the platform generates (agreements, verification codes, staff invites and password
resets, invoices and receipts, signed-form copies) goes through `render_branded_email`, so they all
share the same header, button, note box and footer instead of each caller hand-writing HTML.

Dependency-free on purpose: it only uses the standard library, so it can be imported anywhere and
unit-tested without a database. Every caller-supplied string is escaped here; callers pass plain text.
"""

from __future__ import annotations

import html
from collections.abc import Iterable
from urllib.parse import urlsplit

FOREST = "#0B2E2A"
CREAM = "#F2F8F6"
GOLD = "#F8991E"
GREEN = "#08675F"
MUTED = "#47615E"
LOGO_URL = "https://www.bhcug.com/brand/bloomwell-mark-ondark-120.png"
COMPANY_LINE = "Bloomwell Home Care Uganda Limited · Kampala, Uganda"
SUPPORT_EMAIL = "info@bhcug.com"
SUPPORT_PHONE = "0787499988"
SAFETY_LINE = "Bloomwell will never ask for payment or passwords by email or SMS."
DEFAULT_FOOTER_REASON = "You received this because a care agreement was prepared for you."


def _safe_url(url: str) -> str:
    """Allow only http(s) links in buttons; anything else is dropped rather than rendered."""
    parts = urlsplit(url or "")
    return url if parts.scheme in {"http", "https"} and parts.netloc else ""


def _lines(text: str | Iterable[str]) -> list[str]:
    items = text.split("\n") if isinstance(text, str) else list(text)
    return [line for line in (str(item).strip() for item in items) if line]


def render_branded_email(
    *,
    paragraphs: str | Iterable[str] = "",
    content_html: str = "",
    content_text: str = "",
    heading: str = "",
    preheader: str = "",
    note: str = "",
    button_label: str = "",
    link: str = "",
    highlight_label: str = "",
    highlight_value: str = "",
    footer_reason: str = DEFAULT_FOOTER_REASON,
) -> tuple[str, str]:
    """Return `(html, plain_text)` for one email in the Bloomwell layout.

    paragraphs       body copy, one paragraph per line (a string with newlines or a list)
    content_html     already-sanitised HTML from the mail composer, placed after `paragraphs` unescaped;
                     only pass HTML that went through the mail sanitiser. `content_text` is its plain twin
    heading          optional large serif title above the body
    preheader        the grey preview line inbox apps show next to the subject
    note             optional cream callout box (for example "This link works once")
    button_label     text on the call-to-action button; shown only together with `link`
    link             https URL for the button, repeated underneath as a copyable link
    highlight_*      optional big-number callout, used for invoice and receipt amounts
    footer_reason    one line saying why the recipient got this email
    """
    esc = html.escape
    safe_link = _safe_url(link)
    link_attr = esc(safe_link, quote=True)

    heading_html = (
        f'<h1 style="margin:0 0 18px;color:{FOREST};font-family:Georgia,\'Times New Roman\',serif;'
        f'font-size:24px;line-height:1.3;font-weight:700">{esc(heading)}</h1>'
        if heading else ""
    )
    body_html = "".join(
        f'<p style="margin:0 0 16px;color:{FOREST};line-height:1.6;font-size:16px">{esc(line)}</p>'
        for line in _lines(paragraphs)
    )
    highlight_html = (
        f'<div style="margin:4px 0 20px;padding:16px 18px;background:{CREAM};border:1px solid #CAD9D5;'
        f'border-radius:10px"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;'
        f'color:{MUTED}">{esc(highlight_label)}</div><div style="margin-top:4px;color:{FOREST};'
        f'font-family:Georgia,\'Times New Roman\',serif;font-size:26px;font-weight:700">{esc(highlight_value)}</div></div>'
        if highlight_value else ""
    )
    note_html = (
        f'<p style="font-size:13px;color:{MUTED};margin:0 0 20px;padding:10px 14px;background:#FEF3E0;'
        f'border-left:3px solid {GOLD}">{esc(note)}</p>'
        if note else ""
    )
    button_html = (
        f'<a href="{link_attr}" style="display:inline-block;padding:14px 22px;min-height:44px;box-sizing:border-box;'
        f'background:{GREEN};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;'
        f'border-bottom:3px solid {GOLD}">{esc(button_label)}</a>'
        if button_label and safe_link else ""
    )
    copy_link = (
        f'<p style="margin:18px 0 0;font-size:13px;color:{MUTED}">Or copy this link: '
        f'<a href="{link_attr}" style="color:{GREEN};word-break:break-all">{link_attr}</a></p>'
        if safe_link else ""
    )
    preheader_html = (
        f'<div style="display:none;font-size:1px;color:{CREAM};line-height:1px;max-height:0;max-width:0;'
        f'opacity:0;overflow:hidden">{esc(preheader)}</div>'
    )

    document = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 8px;background:{CREAM};font-family:Arial,Helvetica,sans-serif">
{preheader_html}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:separate;border:1px solid #CAD9D5;border-radius:12px;overflow:hidden">
<tr><td style="height:5px;line-height:5px;font-size:0;background:{GOLD}">&nbsp;</td></tr>
<tr><td style="padding:24px 28px;background:{FOREST};color:{CREAM};font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:.02em"><img src="{LOGO_URL}" width="36" height="40" alt="" style="vertical-align:middle;margin-right:12px;border:0">Bloomwell <span style="color:#FBA94A">Home Care</span></td></tr>
<tr><td style="padding:30px 28px">{heading_html}{body_html}{content_html}{highlight_html}{note_html}{button_html}{copy_link}</td></tr>
<tr><td style="padding:20px 28px;background:#FEF3E0;border-top:1px solid #FCE6C4;color:{MUTED};font-size:12px;line-height:1.6">{esc(COMPANY_LINE)}<br><a href="mailto:{SUPPORT_EMAIL}" style="color:{GREEN}">{SUPPORT_EMAIL}</a> · {SUPPORT_PHONE}<br>{esc(footer_reason)}<br>{esc(SAFETY_LINE)}</td></tr>
</table></td></tr></table></body></html>'''

    plain_parts: list[str] = []
    if heading:
        plain_parts.append(heading)
    plain_parts.extend(_lines(paragraphs))
    if content_text.strip():
        plain_parts.append(content_text.strip())
    if highlight_value:
        plain_parts.append(f"{highlight_label}: {highlight_value}" if highlight_label else highlight_value)
    if note:
        plain_parts.append(note)
    plain = "\n\n".join(plain_parts)
    if safe_link:
        plain += f"\n\n{button_label or 'Open'}: {safe_link}"
    plain += (
        f"\n\n{COMPANY_LINE.replace(' · ', chr(10))}\n{SUPPORT_EMAIL} · {SUPPORT_PHONE}\n{SAFETY_LINE}"
    )
    return document, plain
