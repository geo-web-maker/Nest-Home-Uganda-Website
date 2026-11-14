"""Render the structured agreement template (blocks) with the agreed field values.

The blocks are extracted once from the owner-supplied source PDF (see tools/agreement_template/).
The same renderer drives the admin preview, the client's signing page and the sealed PDF, so the
three can never drift apart. Typed values fill the original blanks, tick boxes and table cells in place.
"""
from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Any

ESC = html.escape

# Brand tokens (mirror frontend design tokens; fixed hex because PDFs cannot read site CSS).
FOREST, LEAF, GOLD, STRAW, STRAW_DEEP, MUTED = "#0B2E2A", "#2A736C", "#F8991E", "#FDEBD0", "#FCE6C4", "#5b6b60"
# Bloomwell mark (lotus, cross, leaves) for printed documents.
MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="104 72 152 168"><path fill="#08675F" d="M186.55,218.05c-3.58-1.58-3.7-5.77-2.46-9.3,4.34-12.43,11.78-22.84,20.55-32.66,16.33-12.12,29.75-12.19,48.93-4.1-7.78,2.79-14.23,7.47-16.62,15.85-9.12,32.02-42.78,58.68-73.61,45.83-20.34-8.47-34.57-26.09-40.61-46.78-2.27-7.79-8.76-12.29-16.3-14.74,17.53-8.76,38.28-8.06,51.53,6.84,8.74,9.84,25,34,15.71,38.97-5.07-10.1-10.67-17.93-20.35-24.93-3.01,10.2.11,20.5,8.49,27.5,13.12,10.95,22.68,10.64,35.73.64,8.61-6.6,12.31-17.22,9.53-27.96-9.74,5.58-15.42,14.19-20.52,24.84Z"/><path fill="#08675F" d="M188.16,166.2h3.67s-.05,6.25-.05,6.25c-.05,6.4-5.59,11.28-11.8,11.27s-11.75-4.86-11.77-11.28l-.04-8.9-8.91-.04c-6.6-.03-11.51-5.93-11.24-12.27.27-6.5,5.64-11.41,12.23-11.38l7.92.04-.03-8.14c-.02-6.51,4.99-11.76,11.37-12.02s12.25,4.67,12.28,11.27l.04,8.88,8.62.03c6.67.02,11.75,5.8,11.56,12.1-.21,6.85-5.77,11.63-12.56,11.61l-27.56-.05-.06,7.89c-.04,4.54,3.18,8.31,7.69,8.6s8.58-3.11,8.62-7.68l.04-6.18ZM200.29,143.58l-12.12-.04-.09-12.66c-.03-4.51-4.3-7.72-8.57-7.48s-7.7,3.81-7.71,8.24v28.29s28.76-.07,28.76-.07c4.52-.01,7.88-4.12,7.76-8.35-.12-4.24-3.52-7.92-8.04-7.93ZM168.13,159.92l.04-16.38-8.6.05c-4.56.02-8.03,3.98-7.9,8.35s3.62,7.95,8.11,7.96l8.34.02Z"/><path fill="#F9B04F" d="M194.66,96.55c-.26,8.89-5.78,16.89-14.08,20.38-8.3-3.49-13.83-11.48-14.08-20.38-.27-9.35,5.34-18.01,14.08-21.69,8.74,3.68,14.35,12.34,14.08,21.69Z"/><path fill="#FBD39B" d="M201.25,117.14c-9.52,5.43-19.74.67-20.66.22-.05-2.45.12-10.23,5.7-17.06,9.07-11.11,23.92-9.31,24.86-9.18,2.79,10.51-1.48,21.23-9.89,26.03Z"/><path fill="#F8991E" d="M160.26,113.7c8.48,6.95,19.35,3.96,20.34,3.67.46-2.41,1.6-10.1-2.76-17.77-7.08-12.46-22.03-13.18-22.98-13.21-4.51,9.9-2.09,21.18,5.4,27.32Z"/></svg>'
# Fills stored in the template are semantic; map them to the brand palette at render time.
FILL_MAP = {"#5b9bd5": LEAF, "#dce6f2": "#EEF4EC"}

EMAIL = re.compile(r"([\w.+-]+@[\w-]+(?:\.[\w-]+)+)")
HANG = re.compile(r"^\d{1,2}\.(?!0\b)\d{1,2}\.")
HEADING = re.compile(r"^\d{1,2}\.0\.")


# Fields shown as money or as a date in the document. The stored value stays plain digits / an ISO date.
MONEY_PATHS = frozenset({
    "schedule_b.assessment_fee", "schedule_b.nursing_visit_shift", "schedule_b.transport",
    "schedule_b.dressings_consumables", "schedule_b.equipment_hire_deposit", "schedule_b.overtime_extra_visit",
    "schedule_b.late_cancellation_charge", "schedule_b.total_fee",
})
DATE_PATHS = frozenset({
    "schedule_a.assessment_date", "schedule_a.care_start_date", "schedule_a.care_end_review_date",
    "schedule_a.patient_rep_initials_date", "schedule_b.start_date", "schedule_b.end_date",
    "schedule_b.advance_due_date",
})
_NUMBER = re.compile(r"^\d+(\.\d{1,2})?$")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SPEC_SPLIT = re.compile(r"[|+,~&]")


def spec_paths(spec: str | None) -> list[str]:
    """The field paths named by a binding spec (meta values such as @date are not fields)."""
    return [p.strip() for p in _SPEC_SPLIT.split(spec or "") if p.strip() and not p.strip().startswith("@")]


def referenced_paths(blocks: list[dict[str, Any]]) -> set[str]:
    """Every field that has a place (blank, tick box or table cell) in the printed agreement."""
    found: set[str] = set()

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("f"), str):
                found.update(spec_paths(node["f"]))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(blocks)
    return found


def _hl_state(ctx: dict[str, Any], spec: str | None) -> str | None:
    """Review-copy colour for a spot in the document: done, needed (staff must fill) or other (client fills)."""
    owners_by_path = ctx.get("hl")
    if owners_by_path is None or not spec:
        return None
    owners = [owners_by_path[p] for p in spec_paths(spec) if p in owners_by_path]
    if not owners:
        return None
    if _value(ctx, spec):
        return "done"
    return "needed" if any(o in ("staff", "clinical") for o in owners) else "other"


def _one(ctx: dict[str, Any], path: str) -> str:
    """One field (or @meta value) as the text printed in the document."""
    path = path.strip()
    raw = ctx["meta"].get(path) if path.startswith("@") else ctx["values"].get(path)
    if isinstance(raw, (list, tuple)):
        raw = ", ".join(str(x) for x in raw)
    text = "" if raw is None else str(raw).strip()
    if path == "schedule_b.payment_option" and (not text or text.upper() == "N/A"):
        return "Standard 50/50"  # blank means the standard payment
    if not text:
        return ""
    if path in MONEY_PATHS and _NUMBER.match(text):
        currency = str(ctx["values"].get("schedule_b.currency") or "UGX")
        number = float(text)
        shown = f"{number:,.0f}" if number == int(number) else f"{number:,.2f}"
        return f"{currency if currency in ('UGX', 'USD') else 'UGX'} {shown}"
    if path in DATE_PATHS and _ISO_DATE.match(text):
        try:
            day = datetime.strptime(text, "%Y-%m-%d")
        except ValueError:
            return text
        return f"{day.day} {day:%b %Y}"
    return text


def _segment(ctx: dict[str, Any], seg: str) -> str:
    if "&" in seg:  # "a&b": b is appended only when a has a value (e.g. a rate followed by its unit)
        main, _, suffix = seg.partition("&")
        first, second = _one(ctx, main), _one(ctx, suffix)
        if suffix.strip() == "schedule_b.price_basis":
            second = second.lower()
        if first.upper() == "N/A" or second.upper() == "N/A":  # "N/A" is never followed by a unit, and a unit of N/A is not printed
            return first if first.upper() == "N/A" else first
        return f"{first} {second}".strip() if first else ""
    if "~" in seg:  # "a~b": a date range
        start, _, end = seg.partition("~")
        return " \u2013 ".join(part for part in (_one(ctx, start), _one(ctx, end)) if part)
    return _one(ctx, seg)


def _value(ctx: dict[str, Any], spec: str) -> str:
    """Resolve a field spec: "a+b" joins with a space, "a,b" with a comma, "a|b" takes the first that has
    a value, "a~b" is a range and "a&b" appends b only when a is filled."""
    for alternative in spec.split("|"):
        chunks = [" ".join(part for part in (_segment(ctx, seg) for seg in chunk.split("+")) if part)
                  for chunk in alternative.split(",")]
        text = ", ".join(chunk for chunk in chunks if chunk)
        if text:
            return text
    return ""


_TITLE_LINE = "Mr./Mrs./Miss./Dr"
_TITLE_OPTIONS = ("Mr", "Mrs", "Miss", "Dr")
_TITLE_SPEC = "client.title+client.name"


def _title_state(ctx: dict[str, Any]) -> tuple[str | None, str]:
    """(matched printed title or None, extra title text to print before the name).

    A title that matches one of the printed options is shown by striking out the others, so it is not
    repeated before the name. Any other real title (e.g. Prof) is printed before the name and every
    option is struck out. Blank or N/A leaves the options as printed and adds nothing before the name."""
    raw = _one(ctx, "client.title").rstrip(".").strip()
    if not raw or raw.upper() == "N/A":
        return None, ""
    for option in _TITLE_OPTIONS:
        if raw.lower() == option.lower():
            return option, ""
    return None, raw


def _title_options_html(ctx: dict[str, Any], text: str) -> str:
    """The printed 'Mr./Mrs./Miss./Dr' text with the options that do not apply crossed out."""
    matched, extra = _title_state(ctx)
    if matched is None and not extra:
        return ESC(text)
    parts = []
    for i, option in enumerate(_TITLE_OPTIONS):
        dot = "." if i < len(_TITLE_OPTIONS) - 1 else ""
        parts.append(ESC(option + dot) if option == matched else f'<s class="t-off">{ESC(option + dot)}</s>')
    return ESC(text).replace(_TITLE_LINE, "/".join(parts), 1)


def _runs_html(runs: list[dict[str, Any]], ctx: dict[str, Any]) -> str:
    out: list[str] = []
    for run in runs:
        kind = run["k"]
        if kind == "t":
            text = EMAIL.sub(r'<span class="mail">\1</span>', _title_options_html(ctx, run["t"]) if _TITLE_LINE in run["t"] else ESC(run["t"]))
            out.append(f"<strong>{text}</strong>" if run.get("b") else text)
        elif kind == "box":
            value = _value(ctx, run["f"]).strip().lower() if run.get("f") else ""
            option = (run.get("o") or "").lower()
            if option and value in [o.lower() for o in run.get("opts", [])]:
                on = value == option  # a choice field ticks exactly its own box
            else:  # older free-text answers: match by keyword
                on = bool(value) and any(word in value for word in run.get("kw", []))
            state = _hl_state(ctx, run.get("f"))
            cls = "box on" if on else "box"
            if state and (state != "done" or on):  # a filled choice marks only the ticked box
                cls += f" hl hl-{state}"
            out.append(f'<span class="{cls}">&#10003;</span>' if on else f'<span class="{cls}"></span>')
        elif kind == "calc":
            value = _value(ctx, run["f"]) if run.get("f") else ""
            if value:
                out.append(f'<span class="filled{" hl hl-done" if _hl_state(ctx, run.get("f")) else ""}">{ESC(value)}</span>')
        elif kind == "blank":
            value = _value(ctx, run["f"]) if run.get("f") else ""
            if run.get("f") == _TITLE_SPEC:  # the title is shown by striking options, or only when it is not one of them
                value = " ".join(part for part in (_title_state(ctx)[1], _one(ctx, "client.name")) if part)
            signed = ctx.get("signatures", {}).get(run.get("s") or run.get("d") or "")
            if signed and run.get("s"):
                out.append(f'<span class="signed-line">{signed["html"]}</span>')
            elif signed and run.get("d"):
                out.append(f'<span class="filled">{ESC(signed["date"])}</span>')
            elif value:
                out.append(f'<span class="filled{" hl hl-done" if _hl_state(ctx, run.get("f")) else ""}">{ESC(value)}</span>')
            else:
                state = _hl_state(ctx, run.get("f"))
                out.append(f'<span class="blank{f" hl hl-{state}" if state else ""}" style="min-width:{min(run["n"], 60) * 0.26:.1f}em"></span>')
    return "".join(out)


def para_text(block: dict[str, Any]) -> str:
    return "".join(run.get("t", "") for run in block.get("runs", []))


def _first_text(runs: list[dict[str, Any]]) -> str:
    for run in runs:
        if run["k"] == "t" and run["t"].strip():
            return run["t"].strip()
    return ""


def _payment_option(ctx: dict[str, Any]) -> str:
    text = _one(ctx, "schedule_b.payment_option").lower()
    return "already" if text.startswith("plan already") else "plan" if text == "payment plan" else "standard"


def _table_html(block: dict[str, Any], ctx: dict[str, Any]) -> str:
    rows: dict[int, list[dict[str, Any]]] = {}
    for cell in sorted(block["cells"], key=lambda c: (c["r"], c["c"])):
        rows.setdefault(cell["r"], []).append(cell)
    total = sum(block["cols"]) or 1
    colgroup = "".join(f'<col style="width:{w * 100 / total:.1f}%">' for w in block["cols"])
    body: list[str] = []
    option = _payment_option(ctx)
    for key in sorted(rows):
        if any(option in (cell.get("hide") or []) for cell in rows[key]):
            continue  # e.g. the advance and balance rows when the client already has a payment plan
        tds: list[str] = []
        for cell in rows[key]:
            if option in (cell.get("alt") or {}):
                cell = {**cell, "lines": cell["alt"][option]}
            style: list[str] = []
            fill = FILL_MAP.get((cell.get("fill") or "").lower(), cell.get("fill"))
            if fill:
                style.append(f"background:{fill}")
            if cell.get("align") == "center":
                style.append("text-align:center")
            if cell.get("valign") == "middle":
                style.append("vertical-align:middle")
            inner = "<br>".join(_runs_html(line, ctx) for line in cell["lines"])
            cell_state = _hl_state(ctx, cell.get("f")) if not inner.strip() else None
            classes = (["th"] if cell.get("hdr") else []) + ([f"hl-cell hl-{cell_state}"] if cell_state else [])
            tag_class = f' class="{" ".join(classes)}"' if classes else ""
            if not inner.strip() and cell.get("f") and _value(ctx, cell["f"]):
                inner = f'<span class="filled">{ESC(_value(ctx, cell["f"]))}</span>'
            tds.append(f'<td{tag_class} colspan="{cell["cs"]}" rowspan="{cell["rs"]}" style="{";".join(style)}">{inner or "&nbsp;"}</td>')
        body.append("<tr>" + "".join(tds) + "</tr>")
    return f'<table class="grid"><colgroup>{colgroup}</colgroup>{"".join(body)}</table>'


def blocks_html(blocks: list[dict[str, Any]], values: dict[str, Any], meta: dict[str, Any],
                signatures: dict[str, dict[str, str]] | None = None,
                highlight: dict[str, str] | None = None) -> str:
    ctx = {"values": values, "meta": meta, "signatures": signatures or {}, "hl": highlight}
    out: list[str] = []
    seen_title = False
    after_schedule = False
    for block in blocks:
        if block["type"] == "table":
            out.append(_table_html(block, ctx))
        elif block["type"] == "para":
            first = _first_text(block["runs"])
            classes = ["p"]
            if block["align"] == "center":
                classes.append("c")
            if HANG.match(first):
                classes.append("h")
            if HEADING.match(first):
                classes.append("hd")
            if any(r["k"] == "blank" for r in block["runs"]):
                classes.append("nj")
            if block["align"] == "center" and not seen_title and block.get("page") == 1:
                classes.append("title")
                seen_title = True
            text = para_text(block).strip()
            if re.fullmatch(r"SCHEDULE [ABC]", text):
                classes.append("sch")
                after_schedule = True
            elif after_schedule:
                classes.append("sch-sub")
                after_schedule = False
            elif (block["align"] == "center" and block.get("underline")) or text.startswith("Interpreter / reader certificate"):
                classes.append("sub")
            elif block.get("underline"):
                classes.append("u")
            if first.startswith("Service enquiries"):
                classes.append("rule")
            indent = block.get("indent", 0)
            style = f' style="margin-left:{min(indent, 60)}pt"' if indent >= 10 and block["align"] != "center" and "h" not in classes else ""
            out.append(f'<p class="{" ".join(classes)}"{style}>{_runs_html(block["runs"], ctx)}</p>')
    return "".join(out)


CSS = f"""
@page{{size:letter;margin:24mm 25mm 20mm;
 @top-center{{content:"BLOOMWELL HOME CARE UGANDA LIMITED";font:bold 8.5pt Georgia,serif;letter-spacing:.06em;color:{FOREST};border-bottom:1.5px solid {GOLD};padding-bottom:4pt;width:100%}}
 @bottom-left{{content:"Bloomwell Home Care \\00b7  " var(--ref);font:8pt Arial,sans-serif;color:{MUTED}}}
 @bottom-right{{content:"Page " counter(page) " of " counter(pages);font:8pt Arial,sans-serif;color:{MUTED}}}}}
@page:first{{@top-center{{content:none;border:0}}}}
*{{box-sizing:border-box}}
body{{font-family:Tahoma,Verdana,'DejaVu Sans',sans-serif;font-size:11pt;line-height:1.38;color:{FOREST};margin:0}}
.p{{margin:0 0 5pt;text-align:justify}} .p.c{{text-align:center}} .p.nj{{text-align:left}}
.p.h{{padding-left:27pt;text-indent:-27pt}}
.p.title{{font-family:Georgia,'Times New Roman',serif;font-size:16pt;letter-spacing:.03em;margin-bottom:3pt}}
.p.rule{{border-bottom:2px solid {GOLD};padding-bottom:7pt;margin-bottom:12pt;color:{MUTED};font-size:9.5pt}}
.p.hd{{font-family:Georgia,'Times New Roman',serif;font-size:13pt;margin:12pt 0 5pt;padding-bottom:2pt;border-bottom:1px solid {STRAW_DEEP};break-after:avoid;text-align:left}}
.p.sch{{font-family:Georgia,'Times New Roman',serif;font-size:15pt;font-weight:700;letter-spacing:.16em;text-align:left;margin:26pt 0 0;padding:9pt 14pt 1pt;background:{FOREST};color:#fff;border-radius:4pt 4pt 0 0;break-before:page;break-after:avoid}}
.p.sch strong,.p.sch-sub strong{{color:inherit}}
.p.sch-sub{{text-align:left;margin:0 0 12pt;padding:0 14pt 9pt;background:{FOREST};color:{STRAW};border-bottom:3px solid {GOLD};border-radius:0 0 4pt 4pt;font-size:10.5pt;break-after:avoid}}
.p.sub{{text-align:left;font-family:Georgia,'Times New Roman',serif;font-size:11.5pt;margin:14pt 0 5pt;padding:1pt 0 1pt 8pt;border-left:3pt solid {GOLD};break-after:avoid}}
.p.c.u{{text-decoration:none;font-family:Georgia,'Times New Roman',serif;border-bottom:1px solid {GOLD};display:table;margin:8pt auto 6pt;padding:0 12pt 2pt}}
.signed-line{{display:inline-block;vertical-align:bottom;border-bottom:1px solid {FOREST};min-width:10em;padding:0 4px}}.signed-line img{{display:block;max-height:46px;max-width:200px;object-fit:contain}}.signed-line small{{display:block;color:#5b6b60;font-size:7.5pt}}.blank{{display:inline-block;border-bottom:1px dotted {FOREST};height:.9em;vertical-align:baseline;max-width:100%}}
.t-off{{text-decoration:line-through;color:#5b6b60}}
.filled{{border-bottom:1px solid {GOLD};font-weight:600;padding:0 2px;color:#0b2a1a;overflow-wrap:anywhere}}
.box{{display:inline-block;width:.95em;height:.95em;border:1px solid {FOREST};vertical-align:-.15em;margin:0 .2em}}
.box.on{{background:{LEAF};color:#fff;font-size:.75em;line-height:.95em;text-align:center;border-color:{LEAF}}}
table.grid{{border-collapse:collapse;margin:6pt 0;width:100%;table-layout:fixed;break-inside:auto}}
table.grid tr{{break-inside:avoid}}
table.grid td{{border:1px solid #9db8a8;padding:3pt 5pt;vertical-align:top;font-size:9.5pt}}
table.grid td.th{{color:#fff;padding:6pt 5pt;border-color:{LEAF};border-bottom:2px solid {GOLD}}}
strong{{font-weight:700}} .mail{{color:#2A736C;text-decoration:underline}}
.banner{{background:{STRAW};border-left:4px solid {GOLD};padding:10px 12px;margin:0 0 12px;font-weight:bold}}
.after{{break-before:page}}
.record{{margin:20pt 0 6pt;break-inside:avoid}}
.after h2,.record h2{{font-family:Georgia,'Times New Roman',serif;font-size:13pt;margin:0 0 8px;padding-bottom:3px;border-bottom:1px solid {STRAW_DEEP}}}
.after table,.record table{{width:100%;border-collapse:collapse}} .after th,.after td,.record th,.record td{{padding:6px 8px;border-bottom:1px solid #CAD9D5;text-align:left;vertical-align:top;font-size:9.5pt}}
.record td{{white-space:pre-wrap}} .after th,.record th{{width:34%;color:{LEAF};background:#F2F8F6}}
.sig{{display:inline-block;width:46%;vertical-align:top;margin:10px 2% 8px 0;min-height:90px;border-bottom:1px solid #6c7a72;padding:8px}}
.signature{{display:block;max-width:220px;max-height:70px;object-fit:contain}}
.verified-stamp{{border:1px solid {LEAF};background:#F2F8F6;color:{FOREST};padding:8px 10px;margin:6px 0;font-size:9pt;font-weight:bold;border-radius:4px}}
@media screen{{body{{max-width:820px;margin:0 auto;padding:22px 26px;background:#fff}}}}
"""


HIGHLIGHT_CSS = """
.hl-needed{background:#FFE066;box-shadow:0 0 0 2px #D9A400}
.hl-done{background:#D7F0DC;box-shadow:0 0 0 2px #7DBF8C}
.hl-other{background:#DCEAF8;box-shadow:0 0 0 2px #7FA9D6}
.box.on.hl-done{background:#2A736C}
.blank.hl{display:inline-block;min-width:8em;height:1.2em}
table.grid td.hl-cell{box-shadow:none}
.legend{border:1px solid #9db8a8;border-left:4px solid #D9A400;padding:8px 12px;margin:0 0 12px;font:9.5pt Arial,sans-serif}
.legend .key{display:inline-block;padding:0 6px;margin:0 4px 0 10px;border-radius:2px}
"""


def document_html(blocks: list[dict[str, Any]], values: dict[str, Any], meta: dict[str, Any], *, title: str,
                  banner: str = "", extra: str = "", signatures: dict[str, dict[str, str]] | None = None,
                  highlight: dict[str, str] | None = None) -> str:
    ref = ESC(str(meta.get("@reference", "")))
    css = CSS + (HIGHLIGHT_CSS if highlight is not None else "")
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{ESC(title)}</title>'
            f'<style>:root{{--ref:"{ref}"}}{css}</style></head><body>{banner}'
            f'{blocks_html(blocks, values, meta, signatures, highlight)}{extra}</body></html>')
