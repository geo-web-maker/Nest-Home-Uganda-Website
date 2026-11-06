from __future__ import annotations

import base64
import html
from datetime import UTC, datetime
from typing import Any

from app.modules.agreements.models import Agreement
from app.modules.agreements import rules


def _format_value(value: Any) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, list):
        return ", ".join(_format_value(item) for item in value)
    if isinstance(value, dict):
        return "; ".join(f"{key}: {_format_value(item)}" for key, item in value.items())
    return str(value)


def render_agreement_html(agreement: Agreement, clauses: dict[str, str], *, signed: bool = False,
                          certificate: dict[str, Any] | None = None,
                          signature_images: dict[str, bytes] | None = None) -> str:
    """Render the same source wording and completed field values for web and PDF."""
    intro = clauses.get("Agreement introduction", "")
    party_paths = [p for p in agreement.fields if rules.field_path(p).startswith(("client.", "patient."))]
    party_details_html = ""
    if party_paths:
        items = []
        for path in sorted(party_paths):
            field = agreement.fields[path]
            label = rules.field_path(path).split(".", 1)[1].replace("_", " ").title()
            items.append(f'<tr><th>{html.escape(label)}</th><td>{html.escape(_format_value(field.value))}</td></tr>')
        party_details_html = f'<section class="party-details"><h3>Completed party details</h3><table>{"".join(items)}</table></section>'

    signatures = []
    for signature in agreement.signatures:
        image_markup = ""
        image = (signature_images or {}).get(signature.image_key)
        if image:
            encoded = base64.b64encode(image).decode("ascii")
            image_markup = f'<img class="signature" alt="Signature" src="data:image/png;base64,{encoded}">'
        signatures.append(
            f'<div class="sig"><strong>{html.escape(signature.role.title())}</strong>{image_markup}'
            f'<div>{html.escape(signature.name)}</div><small>{signature.signed_at.isoformat()}</small></div>'
        )
    signature_html = (
        f'<div class="signature-list"><h3>Captured signatures</h3>{"".join(signatures)}</div>'
        if signatures else '<div class="signature-list"><h3>Agreement signatures</h3><p>Signatures will be captured by the secure signing process.</p></div>'
    )

    # Keep the legal clauses in source order. Clause 1.2 is followed immediately by
    # the actual values for its dotted party-detail fields, not detached at the end.
    clause_html: list[str] = []
    for number, body in clauses.items():
        if number in {"Agreement introduction", "Schedule A", "Schedule B", "Schedule C"}:
            continue
        paragraphs = "".join(
            f'<p>{html.escape(part.strip())}</p>'
            for part in body.split("\n") if part.strip()
        )
        if number.endswith(".0"):
            clause_html.append(f'<section class="clause"><h2>{html.escape(number + " " + body.strip())}</h2></section>')
        else:
            clause_html.append(f'<section class="clause"><h3>{html.escape(number)}</h3>{paragraphs}</section>')
        if number == "1.2" and party_details_html:
            clause_html.append(party_details_html)

    schedule_groups = {
        "Schedule A": "Schedule A — Patient details and agreed care plan",
        "Schedule B": "Schedule B — Fees and payment arrangements",
        "Schedule C": "Schedule C — Consent, communication and signatures",
    }
    schedule_html: list[str] = []
    for key, group in schedule_groups.items():
        source_text = clauses.get(key, "")
        paragraphs = "".join(
            f'<p>{html.escape(part.strip())}</p>'
            for part in source_text.split("\n") if part.strip()
        )
        paths = [p for p in agreement.fields if rules.field_path(p).startswith(key.lower().replace(" ", "_") + ".")]
        items = []
        for path in sorted(paths):
            field = agreement.fields[path]
            label = rules.field_path(path).split(".", 1)[1].replace("_", " ").title()
            items.append(f'<tr><th>{html.escape(label)}</th><td>{html.escape(_format_value(field.value))}</td></tr>')
        completed_fields = (
            f'<h3>Completed schedule fields</h3><table>{"".join(items)}</table>' if items else ""
        )
        fee_summary = ""
        if key == "Schedule B":
            computed = agreement.schedule_b_computed or {}
            currency = html.escape(str(computed.get("currency", "UGX")))
            booking_currency = html.escape(str(computed.get("booking_fee_currency", "UGX")))
            booking = html.escape(_format_value(computed.get("booking_fee", 50000)))
            service_total = html.escape(_format_value(computed.get("total_service_fees", computed.get("care_fee", 0))))
            advance = html.escape(_format_value(computed.get("advance", 0)))
            balance = html.escape(_format_value(computed.get("balance", 0)))
            payable = computed.get("total_payable_if_ugx")
            total_row = (f'<tr><th>Total payable (UGX)</th><td>{html.escape(_format_value(payable))}</td></tr>'
                         if payable is not None else '')
            fee_summary = (
                '<h3>Calculated payment summary</h3><table>'
                f'<tr><th>Separate booking fee</th><td>{booking} {booking_currency} (additional; excluded from 50/50 split)</td></tr>'
                f'<tr><th>Agreed service fees</th><td>{service_total} {currency}</td></tr>'
                f'<tr><th>50% advance on service fees</th><td>{advance} {currency}</td></tr>'
                f'<tr><th>Remaining 50% balance</th><td>{balance} {currency}</td></tr>{total_row}'
                '</table>'
            )
        if key == "Schedule C":
            completed_fields += signature_html
        schedule_html.append(
            f'<section class="schedule"><h2>{html.escape(group)}</h2>{paragraphs}'
            f'{completed_fields}{fee_summary}</section>'
        )
    variation_html = (f'<div class="banner variation">AMENDMENT — This agreement varies clause {html.escape(agreement.variation_clause or "")}. The original completed agreement remains in effect except for the change expressly approved in this amendment.</div>' if agreement.variation_clause else '')
    certificate_html = ""
    if certificate:
        rows = "".join(
            f'<tr><th>{html.escape(str(k).replace("_", " ").title())}</th><td>{html.escape(_format_value(v))}</td></tr>'
            for k, v in certificate.items()
        )
        certificate_html = f'<section class="certificate"><h1>Certificate of completion</h1><table>{rows}</table></section>'
    agreement_date = agreement.created_at.date().isoformat() if agreement.created_at else datetime.now(UTC).date().isoformat()
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bloomwell care agreement {html.escape(agreement.reference)}</title><style>
@page{{size:letter;margin:18mm 16mm 20mm;@bottom-left{{content:"Bloomwell Home Care · {html.escape(agreement.reference)}";font:9pt Arial;color:#5b6b60}}@bottom-right{{content:"Page " counter(page) " of " counter(pages);font:9pt Arial;color:#5b6b60}}}}
*{{box-sizing:border-box}}body{{font-family:Arial,Helvetica,sans-serif;color:#123524;font-size:10.5pt;line-height:1.5;margin:0}}header{{border-bottom:2px solid #C79A3B;box-shadow:0 5px 0 #123524;padding:0 0 16px;margin-bottom:26px}}.brand{{font-family:Georgia,'Times New Roman',serif;font-size:19pt;font-weight:700;color:#123524;letter-spacing:.02em}}.ref{{font-size:9pt;color:#9a7420;letter-spacing:.14em;font-weight:700}}h1{{font-family:Georgia,'Times New Roman',serif;font-size:18pt;color:#123524}}h2{{font-family:Georgia,'Times New Roman',serif;font-size:13pt;color:#123524;margin:20px 0 8px;padding-bottom:3px;border-bottom:1px solid #E9DDB8}}h3{{font-size:11pt;color:#2F6B4A;margin:12px 0 5px}}p{{white-space:pre-wrap}}.clause{{break-inside:avoid}}.party-details{{margin:10px 0 18px;padding:10px;border:1px solid #CBD8C6;border-top:3px solid #C79A3B;border-radius:4px}}.schedule,.certificate{{break-before:page}}table{{width:100%;border-collapse:collapse}}th,td{{padding:7px 9px;border-bottom:1px solid #CBD8C6;text-align:left;vertical-align:top}}th{{width:34%;color:#2F6B4A;background:#F3F8F1}}.sig{{display:inline-block;width:46%;vertical-align:top;margin:12px 2% 10px 0;min-height:100px;border-bottom:1px solid #6c7a72;padding:8px}}.signature{{display:block;max-width:220px;max-height:70px;object-fit:contain}}.signature-list{{margin-top:20px;border-top:2px solid #C79A3B;padding-top:12px}}.banner{{background:#F4EBCB;color:#123524;border-left:4px solid #C79A3B;padding:12px;margin:0 0 16px;font-weight:bold}}.certificate{{break-before:page}}.intro{{color:#5b6b60;font-size:9.5pt;margin-top:4px}}.agreement-meta{{display:flex;gap:24px;margin-top:10px;font-size:9.5pt}}
@media screen{{body{{max-width:850px;margin:24px auto;padding:24px;background:#fff}}}}@media print{{.no-print{{display:none}}}}
</style></head><body><header><div class="brand">BLOOMWELL HOME CARE UGANDA LIMITED</div><div class="ref">CLIENT HOME NURSING SERVICE AGREEMENT · UNDER THE NEST MAMA PROGRAM</div><div class="intro">{html.escape(intro)}</div><div class="agreement-meta"><span>Agreement Reference: <strong>{html.escape(agreement.reference)}</strong></span><span>Date: <strong>{html.escape(agreement_date)}</strong></span></div></header>
{'<div class="banner">SIGNED AGREEMENT</div>' if signed else ''}{variation_html}{''.join(clause_html)}{''.join(schedule_html)}{certificate_html}</body></html>'''


def render_pdf(html_document: str) -> bytes:
    """Render vector text PDF. WeasyPrint is installed in the production backend image."""
    try:
        from weasyprint import HTML
    except ImportError as exc:  # fail closed; never create a fake/raster PDF
        raise RuntimeError("Vector PDF support is not installed. Deploy the WeasyPrint runtime packages.") from exc
    return HTML(string=html_document, base_url="https://bhcug.com/").write_pdf()


def make_certificate(agreement: Agreement, content_hash: str) -> dict[str, Any]:
    return {
        "reference": agreement.reference,
        "template_version": agreement.template_version,
        "template_hash": agreement.template_hash,
        "parties": {
            "client": agreement.fields.get(rules.field_key("client.name")).value if agreement.fields.get(rules.field_key("client.name")) else None,
            "patient": agreement.fields.get(rules.field_key("patient.full_name")).value if agreement.fields.get(rules.field_key("patient.full_name")) else None,
            "bloomwell_signatory": next((s.name for s in agreement.signatures if s.role == "bloomwell"), None),
        },
        "client_signed_at": next((s.signed_at.isoformat() for s in agreement.signatures if s.role in {"client", "representative"}), None),
        "countersigned_at": next((s.signed_at.isoformat() for s in agreement.signatures if s.role == "bloomwell"), None),
        "verification_method": "email_or_sms_otp_and_signature_capture",
        "ip_hash_prefix": next((s.ip_hash[:12] for s in agreement.signatures if s.ip_hash), None),
        "content_hash": content_hash,
        "sealed_at": datetime.now(UTC).isoformat(),
    }
