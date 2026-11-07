"""Render the structured agreement template (blocks) with the agreed field values.

The blocks are extracted once from the owner-supplied source PDF (see tools/agreement_template/).
The same renderer drives the admin preview, the client's signing page and the sealed PDF, so the
three can never drift apart. Typed values fill the original blanks, tick boxes and table cells in place.
"""
from __future__ import annotations

import html
import re
from typing import Any

ESC = html.escape

# Brand tokens (mirror frontend design tokens; fixed hex because PDFs cannot read site CSS).
FOREST, LEAF, GOLD, STRAW, STRAW_DEEP, MUTED = "#123524", "#2F6B4A", "#C79A3B", "#F4EBCB", "#E9DDB8", "#5b6b60"
# Fills stored in the template are semantic; map them to the brand palette at render time.
FILL_MAP = {"#5b9bd5": LEAF, "#dce6f2": "#EEF4EC"}

EMAIL = re.compile(r"([\w.+-]+@[\w-]+(?:\.[\w-]+)+)")
HANG = re.compile(r"^\d{1,2}\.(?!0\b)\d{1,2}\.")
HEADING = re.compile(r"^\d{1,2}\.0\.")


def _value(ctx: dict[str, Any], spec: str) -> str:
    parts: list[str] = []
    for path in spec.split("+"):
        raw = ctx["meta"].get(path) if path.startswith("@") else ctx["values"].get(path)
        if isinstance(raw, (list, tuple)):
            raw = ", ".join(str(x) for x in raw)
        if raw not in (None, ""):
            parts.append(str(raw))
    return " ".join(parts)


def _runs_html(runs: list[dict[str, Any]], ctx: dict[str, Any]) -> str:
    out: list[str] = []
    for run in runs:
        kind = run["k"]
        if kind == "t":
            text = EMAIL.sub(r'<span class="mail">\1</span>', ESC(run["t"]))
            out.append(f"<strong>{text}</strong>" if run.get("b") else text)
        elif kind == "box":
            value = _value(ctx, run["f"]).lower() if run.get("f") else ""
            on = bool(value) and any(word in value for word in run.get("kw", []))
            out.append('<span class="box on">&#10003;</span>' if on else '<span class="box"></span>')
        elif kind == "calc":
            value = _value(ctx, run["f"]) if run.get("f") else ""
            if value:
                out.append(f'<span class="filled">{ESC(value)}</span>')
        elif kind == "blank":
            value = _value(ctx, run["f"]) if run.get("f") else ""
            if value:
                out.append(f'<span class="filled">{ESC(value)}</span>')
            else:
                out.append(f'<span class="blank" style="min-width:{min(run["n"], 60) * 0.26:.1f}em"></span>')
    return "".join(out)


def _first_text(runs: list[dict[str, Any]]) -> str:
    for run in runs:
        if run["k"] == "t" and run["t"].strip():
            return run["t"].strip()
    return ""


def _table_html(block: dict[str, Any], ctx: dict[str, Any]) -> str:
    rows: dict[int, list[dict[str, Any]]] = {}
    for cell in sorted(block["cells"], key=lambda c: (c["r"], c["c"])):
        rows.setdefault(cell["r"], []).append(cell)
    total = sum(block["cols"]) or 1
    colgroup = "".join(f'<col style="width:{w * 100 / total:.1f}%">' for w in block["cols"])
    body: list[str] = []
    for key in sorted(rows):
        tds: list[str] = []
        for cell in rows[key]:
            style: list[str] = []
            fill = FILL_MAP.get((cell.get("fill") or "").lower(), cell.get("fill"))
            if fill:
                style.append(f"background:{fill}")
            if cell.get("align") == "center":
                style.append("text-align:center")
            if cell.get("valign") == "middle":
                style.append("vertical-align:middle")
            tag_class = ' class="th"' if cell.get("hdr") else ""
            inner = "<br>".join(_runs_html(line, ctx) for line in cell["lines"])
            if not inner.strip() and cell.get("f") and _value(ctx, cell["f"]):
                inner = f'<span class="filled">{ESC(_value(ctx, cell["f"]))}</span>'
            tds.append(f'<td{tag_class} colspan="{cell["cs"]}" rowspan="{cell["rs"]}" style="{";".join(style)}">{inner or "&nbsp;"}</td>')
        body.append("<tr>" + "".join(tds) + "</tr>")
    return f'<table class="grid"><colgroup>{colgroup}</colgroup>{"".join(body)}</table>'


def blocks_html(blocks: list[dict[str, Any]], values: dict[str, Any], meta: dict[str, Any]) -> str:
    ctx = {"values": values, "meta": meta}
    out: list[str] = []
    seen_title = False
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
            if block.get("underline"):
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
.p.c.u{{text-decoration:none;font-family:Georgia,'Times New Roman',serif;border-bottom:1px solid {GOLD};display:table;margin:8pt auto 6pt;padding:0 12pt 2pt}}
.blank{{display:inline-block;border-bottom:1px dotted {FOREST};height:.9em;vertical-align:baseline;max-width:100%}}
.filled{{border-bottom:1px solid {GOLD};font-weight:600;padding:0 2px;color:#0b2a1a;overflow-wrap:anywhere}}
.box{{display:inline-block;width:.95em;height:.95em;border:1px solid {FOREST};vertical-align:-.15em;margin:0 .2em}}
.box.on{{background:{LEAF};color:#fff;font-size:.75em;line-height:.95em;text-align:center;border-color:{LEAF}}}
table.grid{{border-collapse:collapse;margin:6pt 0;width:100%;table-layout:fixed;break-inside:auto}}
table.grid tr{{break-inside:avoid}}
table.grid td{{border:1px solid #9db8a8;padding:3pt 5pt;vertical-align:top;font-size:9.5pt}}
table.grid td.th{{color:#fff;padding:6pt 5pt;border-color:{LEAF};border-bottom:2px solid {GOLD}}}
strong{{font-weight:700}} .mail{{color:#2F6B4A;text-decoration:underline}}
.banner{{background:{STRAW};border-left:4px solid {GOLD};padding:10px 12px;margin:0 0 12px;font-weight:bold}}
.after{{break-before:page}}
.after h2{{font-family:Georgia,'Times New Roman',serif;font-size:13pt;margin:0 0 8px;padding-bottom:3px;border-bottom:1px solid {STRAW_DEEP}}}
.after table{{width:100%;border-collapse:collapse}} .after th,.after td{{padding:6px 8px;border-bottom:1px solid #CBD8C6;text-align:left;vertical-align:top;font-size:9.5pt}}
.after th{{width:34%;color:{LEAF};background:#F3F8F1}}
.sig{{display:inline-block;width:46%;vertical-align:top;margin:10px 2% 8px 0;min-height:90px;border-bottom:1px solid #6c7a72;padding:8px}}
.signature{{display:block;max-width:220px;max-height:70px;object-fit:contain}}
.verified-stamp{{border:1px solid {LEAF};background:#F3F8F1;color:{FOREST};padding:8px 10px;margin:6px 0;font-size:9pt;font-weight:bold;border-radius:4px}}
@media screen{{body{{max-width:820px;margin:0 auto;padding:22px 26px;background:#fff}}}}
"""


def document_html(blocks: list[dict[str, Any]], values: dict[str, Any], meta: dict[str, Any], *, title: str,
                  banner: str = "", extra: str = "") -> str:
    ref = ESC(str(meta.get("@reference", "")))
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{ESC(title)}</title>'
            f'<style>:root{{--ref:"{ref}"}}{CSS}</style></head><body>{banner}'
            f'{blocks_html(blocks, values, meta)}{extra}</body></html>')
