from __future__ import annotations

import html
from typing import Any

from app.modules.agreements import blocks as block_renderer
from app.modules.agreements import render as agreement_render

NEST_MARK = block_renderer.MARK_SVG.replace("<svg ", '<svg width="36" height="40" ', 1)


def qr_svg(url: str) -> str:
    import segno

    return segno.make(url, error="m").svg_inline(scale=3, border=1, dark="#0B2E2A", light="#ffffff")


def money(value: int) -> str:
    if type(value) is not int or value < 0:
        raise ValueError("Money must be a non-negative integer UGX amount")
    return f"UGX {value:,}"


def _e(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def document_html(
    snapshot: dict[str, Any], content_hash: str, layout: str, *, voided_at: str | None = None
) -> str:
    if layout not in {"ledger", "slip"}:
        raise ValueError("Unknown billing layout")
    reference = _e(snapshot["reference"])
    doc_type = snapshot["doc_type"]
    title = "Invoice" if doc_type == "invoice" else "Payment Receipt"
    bill = snapshot["bill_to"]
    care = snapshot.get("care_recipient") or {}
    url = agreement_render.verify_url(snapshot["reference"], content_hash)
    qr = qr_svg(url)
    items = snapshot.get("items", [])
    stamp_parts: list[str] = []
    if snapshot.get("is_test"):
        stamp_parts.append("PRACTICE - NOT A REAL DOCUMENT")
    if voided_at:
        stamp_parts.append(f"VOID - {_e(voided_at[:10])}")
        stamp_class = "void"
    elif doc_type == "receipt":
        receipt_status = str(snapshot.get("receipt_status", "PAID"))
        stamp_parts.append(receipt_status)
        stamp_class = "ok" if receipt_status == "PAID" else "due"
    else:
        stamp_parts.append("UNPAID")
        stamp_class = "practice" if snapshot.get("is_test") else "due"
    stamp_text = " / ".join(stamp_parts)

    def item_rows() -> str:
        return "".join(
            f"<tr><td>{_e(item['description'])}<small>{_e(item.get('service_date_text', ''))}</small></td>"
            f"<td class='r'>{item['quantity']}</td><td class='r'>{money(item['unit_price_ugx'])}</td>"
            f"<td class='r'>{money(item['amount_ugx'])}</td></tr>"
            for item in items
        )

    care_text = ""
    if care.get("name") or care.get("program"):
        care_text = (
            f'<div><span class="lab">Care recipient</span><b>{_e(care.get("name"))}</b>'
            f"<br>{_e(care.get('program'))}</div>"
        )

    if layout == "ledger":
        if doc_type == "invoice":
            meta = (
                f'<div><span class="lab">Date</span>{_e(snapshot.get("document_date"))}</div>'
                f'<div><span class="lab">Due date</span>{_e(snapshot.get("due_date"))}</div>'
                '<div><span class="lab">Currency</span>UGX</div>'
            )
            totals = (
                f'<tr><td>Total</td><td class="r">{money(snapshot["total_ugx"])}</td></tr>'
                f'<tr class="v"><td>Paid</td><td class="r">{money(snapshot.get("paid_ugx", 0))}</td></tr>'
                f'<tr class="g"><td>Balance due</td><td class="r">{money(snapshot["balance_ugx"])}</td></tr>'
            )
            payment_box = (
                f'<div class="pay"><b>Payment instructions</b><p>{_e(snapshot.get("payment_instructions") or "Client to supply")}</p>'
                f"<small>Payment details: Client to supply</small></div>"
            )
        else:
            meta = (
                f'<div><span class="lab">Date</span>{_e(snapshot.get("document_date"))}</div>'
                f'<div><span class="lab">Invoice</span>{_e(snapshot.get("invoice_reference"))}</div>'
                '<div><span class="lab">Currency</span>UGX</div>'
            )
            totals = (
                f'<tr><td>Invoice total</td><td class="r">{money(snapshot["invoice_total_ugx"])}</td></tr>'
                f'<tr class="v"><td>Received</td><td class="r">{money(snapshot["amount_ugx"])}</td></tr>'
                f'<tr class="g"><td>Balance</td><td class="r">{money(snapshot["balance_after_ugx"])}</td></tr>'
            )
            payment_box = (
                f'<div class="pay"><b>Payment method</b><p>{_e(snapshot.get("method_label"))}</p>'
                f"<small>Reference: {_e(snapshot.get('payer_reference') or 'Client to supply')}</small>"
                f"<small>Paid on: {_e(snapshot.get('paid_on'))}</small></div>"
            )
        stamp = f'<div class="stamp {stamp_class}">{_e(stamp_text)}</div>'
        markup = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{_e(title)} {reference}</title>
<style>
@page{{size:A4;margin:14mm 14mm 12mm}}
*{{box-sizing:border-box}}body{{font:10pt/1.45 Arial,Helvetica,sans-serif;color:#0B2E2A;margin:0}}
.top{{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #F8991E;box-shadow:0 4px 0 #0B2E2A;padding-bottom:12px;position:relative}}
.brand{{border-collapse:collapse}}.brand td{{vertical-align:middle;padding:0 8px 0 0}}.bn{{font:700 17pt Georgia,serif}}.bs{{font-size:9pt;color:#9a7420;font-weight:700}}
.dochead{{text-align:right;padding-right:118pt}}h1{{font:700 21pt Georgia,serif;margin:0;text-align:right}}.no{{text-align:right;font-size:9pt;letter-spacing:.14em;font-weight:700;color:#9a7420;margin-top:3px}}
.stamp{{position:absolute;right:0;top:3pt;border:3px solid;padding:2px 10px;font:700 12pt Arial;letter-spacing:.12em;transform:rotate(-8deg);max-width:112pt;text-align:center}}
.stamp.ok{{color:#08675F}}.stamp.due{{color:#9a7420}}.stamp.void,.stamp.practice{{color:#a21d24}}
.meta{{display:flex;margin:22px 0 14px;border:1px solid #CAD9D5;border-top:3px solid #F8991E}}.meta>div{{flex:1;padding:6px 9px;border-right:1px solid #CAD9D5}}.meta>div:last-child{{border:0}}
.lab{{display:block;font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#47615E;font-weight:700}}
.two{{display:flex;gap:24px;margin-bottom:14px}}.two>div{{flex:1}}
table.it{{width:100%;border-collapse:collapse}}.it thead{{display:table-header-group}}.it th{{text-align:left;background:#EEF4EC;color:#2A736C;padding:7px;border-bottom:1px solid #CAD9D5}}.it td{{padding:8px 7px;border-bottom:1px solid #CAD9D5}}.it tr{{break-inside:avoid}}.r{{text-align:right}}
table.tot{{width:52%;margin:10px 0 0 auto;border-collapse:collapse}}.tot td{{padding:3px 7px}}.tot .g td{{border-top:2px solid #0B2E2A;font-weight:700;font-size:11.5pt;padding-top:6px}}.tot .v td{{color:#08675F;font-weight:700}}
.foot{{display:flex;justify-content:space-between;align-items:flex-end;gap:14pt;margin-top:26px;break-inside:avoid}}.pay{{background:#FDEBD0;border-left:4px solid #F8991E;padding:9px 11px;width:62%}}
.vq{{text-align:center;font-size:7.5pt;color:#47615E;width:30%}}.qr{{width:26mm;height:26mm;display:block;margin:0 auto 3px}}
.last-block{{break-inside:avoid}}.legal{{margin-top:16px;padding-top:7px;border-top:1px solid #FCE6C4;font-size:7.5pt;color:#47615E;display:flex;justify-content:space-between}}
small{{font-size:8pt}}p{{margin:4pt 0}}.totals-wrap{{break-inside:avoid}}
</style></head><body>
<div class="top"><table class="brand"><tr><td>{NEST_MARK}</td><td><b class="bn">Bloomwell</b><br><span class="bs">Home Care Uganda</span></td></tr></table>
<div class="dochead"><h1>{_e(title)}</h1><div class="no">{reference}</div></div>{stamp}</div>
<div class="meta">{meta}</div>
<div class="two"><div><span class="lab">Bill to</span><b>{_e(bill.get("name"))}</b><br>{_e(bill.get("address"))}<br>{_e(bill.get("phone"))}<br>{_e(bill.get("email"))}</div>{care_text}</div>
<table class="it"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>{item_rows()}</tbody></table>
<div class="last-block"><div class="totals-wrap"><table class="tot">{totals}</table></div>
<div class="foot">{payment_box}<div class="vq">{qr}<b>Check this document is genuine.</b><br>Scan the code or open the link below.<br><small>{_e(url)}</small></div></div></div>
<div class="legal"><span>Bloomwell Home Care Uganda Limited</span><span>Bombo Road, Matugga, Wakiso District</span><span>info@bhcug.com | 0787 499 988</span></div>
</body></html>"""
        return markup

    if doc_type == "invoice":
        slip_totals = (
            f'<div class="row"><span>Total</span><b>{money(snapshot["total_ugx"])}</b></div>'
            f'<div class="row"><span>Paid</span><span>{money(snapshot.get("paid_ugx", 0))}</span></div>'
            f'<div class="row"><b>Balance</b><b>{money(snapshot["balance_ugx"])}</b></div>'
        )
        payment_text = f'<div class="c">Payment instructions<br>{_e(snapshot.get("payment_instructions") or "Client to supply")}<br>Payment details: Client to supply</div>'
        due_row = (
            f'<div class="row"><span>Due</span><span>{_e(snapshot.get("due_date"))}</span></div>'
        )
    else:
        slip_totals = (
            f'<div class="row"><span>Invoice total</span><span>{money(snapshot["invoice_total_ugx"])}</span></div>'
            f'<div class="row"><b>Received</b><b>{money(snapshot["amount_ugx"])}</b></div>'
            f'<div class="row"><span>Balance</span><span>{money(snapshot["balance_after_ugx"])}</span></div>'
        )
        payment_text = f'<div class="c">{_e(snapshot.get("method_label"))}<br>Ref {_e(snapshot.get("payer_reference") or "Client to supply")}</div>'
        due_row = f'<div class="row"><span>Invoice</span><span>{_e(snapshot.get("invoice_reference"))}</span></div>'
    slip_items = "".join(
        f'<div class="itemdesc">{_e(item["description"])}</div>'
        f'<div class="row itemrow"><span>{item["quantity"]} x {money(item["unit_price_ugx"])}</span><span>{money(item["amount_ugx"])}</span></div>'
        for item in items
    )
    item_font = "8pt" if len(items) <= 10 else "6pt"
    care_slip = (
        f'<div class="row"><span>Care recipient</span><span>{_e(care.get("name"))}</span></div>'
        if care.get("name")
        else ""
    )
    stamp_slip = f'<div class="sp {stamp_class}">{_e(stamp_text)}</div>'
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{_e(title)} {reference}</title><style>
@page{{size:80mm auto;margin:4mm}}*{{box-sizing:border-box}}body{{font:9pt/1.45 "Courier New",monospace;color:#0B2E2A;margin:0;width:72mm}}
.lg{{text-align:center;border-bottom:3px double #F8991E;padding-bottom:8px;margin-bottom:6px}}.lg svg{{display:block;margin:0 auto 3px}}.bn{{font:700 14pt Georgia,serif}}.bs{{font:700 8pt Arial;color:#9a7420}}
h3{{margin:4px 0;font:700 11pt Arial;text-align:center;letter-spacing:.08em;text-transform:uppercase}}
hr{{border:0;border-top:1px dashed #0B2E2A;margin:7px 0}}.row{{display:flex;justify-content:space-between;gap:4px}}.c{{text-align:center}}
.sp{{border:2px solid;text-align:center;margin:8px 0;font:700 11pt Arial;letter-spacing:.14em;padding:2px}}.itemdesc,.itemrow{{font-size:{item_font};line-height:1.05;margin:0}}.ok{{color:#08675F}}.due{{color:#9a7420}}.void,.practice{{color:#a21d24}}
.qr{{width:24mm;height:24mm;display:block;margin:8px auto 3px}}.sm{{font-size:7.5pt;overflow-wrap:anywhere}}
</style></head><body>
<div class="lg">{NEST_MARK}<span class="bn">Bloomwell</span><br><span class="bs">Home Care Uganda</span></div>
<h3>{_e(title)}</h3><hr>
<div class="row"><span>No.</span><span>{reference}</span></div>
<div class="row"><span>Date</span><span>{_e(snapshot.get("document_date"))}</span></div>
<div class="row"><span>Client</span><span>{_e(bill.get("name"))}</span></div>
{due_row}{care_slip}<hr>{slip_items}<hr>{slip_totals}{stamp_slip}{payment_text}
{qr}<div class="c sm">{_e(url)}</div><hr>
<div class="c sm">Bloomwell Home Care Uganda Limited<br>Bombo Road, Matugga, Wakiso District<br>info@bhcug.com | 0787 499 988</div>
</body></html>"""


MAX_SLIP_HEIGHT_MM = 1200


def slip_document(markup: str, item_count: int):
    """Render the 80 mm slip on a single page, growing the page until the content fits."""
    from weasyprint import HTML

    height = max(120, min(MAX_SLIP_HEIGHT_MM, 120 + item_count * 4))
    for _ in range(16):
        document = HTML(
            string=markup.replace("@page{size:80mm auto", f"@page{{size:80mm {height}mm")
        ).render()
        if len(document.pages) == 1:
            return document
        if height >= MAX_SLIP_HEIGHT_MM:
            break
        height = min(MAX_SLIP_HEIGHT_MM, height + 25)
    raise RuntimeError("The 80 mm receipt did not fit on one page.")


def render_pdf(
    snapshot: dict[str, Any], content_hash: str, layout: str, *, voided_at: str | None = None
) -> bytes:
    from weasyprint import HTML

    markup = document_html(snapshot, content_hash, layout, voided_at=voided_at)
    if layout == "ledger":
        return HTML(string=markup).write_pdf()
    return slip_document(markup, len(snapshot.get("items", []))).write_pdf()
