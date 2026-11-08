from __future__ import annotations

import base64
import html
from datetime import UTC, datetime
from typing import Any

from app.modules.agreements.models import Agreement
from app.modules.agreements import blocks as block_renderer, credentials, rules


PRACTICE_BANNER = ('<div class="banner">PRACTICE AGREEMENT. For testing only: it has no legal effect '
                   'and will be deleted automatically.</div>')


def _format_value(value: Any) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, list):
        return ", ".join(_format_value(item) for item in value)
    if isinstance(value, dict):
        return "; ".join(f"{key}: {_format_value(item)}" for key, item in value.items())
    return str(value)


_METHOD_LABELS = {"drawn": "Drawn signature", "biometric": "Device fingerprint / face", "password": "Passphrase",
                  "passkey": "Device fingerprint / face"}
_ROLE_LABELS = {"client": "Client", "representative": "Authorised representative", "bloomwell": "Bloomwell Home Care"}


def _nice_time(value: Any) -> str:
    if not value:
        return "—"
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return stamp.astimezone(UTC).strftime("%d %b %Y, %H:%M UTC")
    except ValueError:
        return str(value)


def public_certificate(cert: dict[str, Any] | None) -> dict[str, Any] | None:
    """Certificate fields a signer may see on screen: no IP addresses, browser strings or token hashes."""
    if not cert:
        return None
    parties = cert.get("parties") or {}
    return {
        "practice": bool(cert.get("practice_agreement")),
        "reference": cert.get("reference"),
        "client": parties.get("client"),
        "patient": parties.get("patient"),
        "client_signed_at": cert.get("client_signed_at"),
        "countersigned_at": cert.get("countersigned_at"),
        "sealed_at": cert.get("sealed_at"),
        "content_hash": cert.get("content_hash"),
        "signers": [
            {"role": sig.get("role"), "name": sig.get("name"), "method": sig.get("method"),
             "signed_at": sig.get("signed_at"), "code_verified_at": sig.get("code_verified_at")}
            for sig in cert.get("signers") or []
        ],
    }


VERIFY_BASE = "https://bhcug.com/verify"


def verify_code(content_hash: str | None) -> str:
    """Short unguessable part of the verify link. Printed in the PDF, so it cannot depend on the PDF's own hash."""
    return (content_hash or "")[:16]


def verify_url(reference: str, content_hash: str | None) -> str:
    return f"{VERIFY_BASE}/{reference}/{verify_code(content_hash)}"


def mask_name(name: Any) -> str:
    """'Jane Client' -> 'J*** C*****': enough for the owner to recognise, not enough to identify to a stranger."""
    words = str(name or "").split()
    return " ".join(w[0] + "*" * min(max(len(w) - 1, 2), 6) for w in words) or "—"


def _qr_svg(url: str) -> str:
    try:
        import segno  # optional: the verify box still prints the link without it
        return segno.make(url, error="m").svg_inline(scale=3, border=1, dark="#123524", light="#ffffff")
    except Exception:  # noqa: BLE001
        return ""


def verify_box_html(cert: dict[str, Any]) -> str:
    url = verify_url(str(cert.get("reference") or ""), cert.get("content_hash"))
    qr = _qr_svg(url)
    return ('<div style="display:flex;gap:12pt;align-items:center;border:1px solid #C79A3B;background:#F4EBCB;'
            'padding:8pt 10pt;margin:10pt 0;break-inside:avoid">'
            f'<div style="flex:none;width:72pt">{qr}</div><div style="font-size:9pt;line-height:1.5">'
            '<strong>Check this document is genuine.</strong><br>Scan the code or open the link below, then '
            'compare the details, or upload this file to confirm it has not been changed.<br>'
            f'<span style="word-break:break-all;color:#123524">{html.escape(url)}</span></div></div>')


def certificate_html(cert: dict[str, Any], *, heading: str = "h2") -> str:
    """Readable certificate of completion for the sealed PDF (full evidence, laid out as tables)."""
    th = 'style="text-align:left;width:34%;padding:4pt 6pt;border:1px solid #9db8a8;background:#EEF4EC;vertical-align:top"'
    td = 'style="padding:4pt 6pt;border:1px solid #9db8a8;vertical-align:top;word-break:break-all"'

    def row(label: str, value: Any) -> str:
        return f"<tr><th {th}>{html.escape(label)}</th><td {td}>{html.escape(_format_value(value))}</td></tr>"

    parties = cert.get("parties") or {}
    summary = "".join([
        row("Agreement reference", cert.get("reference")),
        row("Client", parties.get("client")), row("Patient", parties.get("patient")),
        row("Client signed", _nice_time(cert.get("client_signed_at"))),
        row("Bloomwell countersigned", _nice_time(cert.get("countersigned_at"))),
        row("Sealed", _nice_time(cert.get("sealed_at"))),
        row("Template version", cert.get("template_version")),
    ])
    signers = ""
    for sig in cert.get("signers") or []:
        signers += '<table style="border-collapse:collapse;width:100%;margin:6pt 0;break-inside:avoid">' + "".join([
            row("Signer", f"{sig.get('name')} ({_ROLE_LABELS.get(str(sig.get('role')), sig.get('role'))})"),
            row("Signature method", _METHOD_LABELS.get(str(sig.get("method")), sig.get("method"))),
            row("Signed", _nice_time(sig.get("signed_at"))),
            row("Code verified", _nice_time(sig.get("code_verified_at"))),
            row("Email / phone used", " / ".join(x for x in (sig.get("email"), sig.get("phone")) if x) or "—"),
            row("IP address", sig.get("ip_address")), row("Device", sig.get("user_agent")),
        ]) + "</table>"
    integrity = "".join([
        row("Content fingerprint (SHA-256)", cert.get("content_hash")),
        row("Template fingerprint", cert.get("template_hash")),
        row("Electronic signature consent", cert.get("electronic_signature_consent")),
        row("Verification", "One-time code sent to the contact on the agreement, then signature capture"),
    ])
    practice = (f'<p style="color:#8a1f1f;font-weight:700">{html.escape(str(cert["practice_agreement"]))}</p>'
                if cert.get("practice_agreement") else "")
    tbl = 'style="border-collapse:collapse;width:100%;margin:6pt 0"'
    return (f'<section class="after" style="break-before:page"><{heading}>Certificate of completion</{heading}>{practice}'
            f'<table {tbl}>{summary}</table><{heading}>Signatures</{heading}>{signers}'
            f'<{heading}>Integrity and consent</{heading}><table {tbl}>{integrity}</table>{verify_box_html(cert)}'
            '<p style="font-size:8.5pt;color:#5b6b60">This certificate records how this agreement was signed. '
            'Any change to the agreement after signing alters its fingerprint.</p></section>')


def _signature_mark(signature: Any, signature_images: dict[str, bytes] | None) -> str:
    image_markup = ""
    image = (signature_images or {}).get(signature.image_key) if signature.image_key else None
    if image:
        encoded = base64.b64encode(image).decode("ascii")
        image_markup = f'<img class="signature" alt="Signature" src="data:image/png;base64,{encoded}">'
    elif signature.method in {"password", "biometric"}:
        credential = str(signature.verification.get("credential_id", ""))[:12]
        detail = f" · credential {html.escape(credential)}…" if credential else ""
        image_markup = (f'<div class="verified-stamp">Electronically signed — '
                        f'{html.escape(credentials.public_label(signature.method, signature.verification.get("type")))}{detail}</div>')
    return image_markup


def _signature_card(signature: Any, signature_images: dict[str, bytes] | None) -> str:
    """One signature block, shared by the legacy and structured renderers.

    Drawn/thumbprint signatures embed their PNG. Password/biometric signatures have no
    image (image_key is None) and instead show a stamp naming the verification method.
    """
    image_markup = _signature_mark(signature, signature_images)
    return (f'<div class="sig"><strong>{html.escape(signature.role.title())}</strong>{image_markup}'
            f'<div>{html.escape(signature.name)}</div><small>{signature.signed_at.isoformat()}</small></div>')


def certificate_html_block(cert: dict[str, Any]) -> str:
    return certificate_html(cert, heading="h1")


def render_agreement_html(agreement: Agreement, clauses: dict[str, str], *, blocks: list[dict[str, Any]] | None = None,
                          signed: bool = False,
                          certificate: dict[str, Any] | None = None,
                          signature_images: dict[str, bytes] | None = None,
                          highlight: bool = False) -> str:
    """Render the same source wording and completed field values for web and PDF.

    `highlight` produces the staff-only review copy (needed / filled / client-completes colours); it is never sent to clients.
    """
    if blocks:
        return _render_blocks(agreement, blocks, signed=signed, certificate=certificate,
                              signature_images=signature_images, highlight=highlight)
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

    signatures = [_signature_card(signature, signature_images) for signature in agreement.signatures]
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
    certificate_html = certificate_html_block(certificate) if certificate else ""
    agreement_date = agreement.created_at.date().isoformat() if agreement.created_at else datetime.now(UTC).date().isoformat()
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bloomwell care agreement {html.escape(agreement.reference)}</title><style>
@page{{size:letter;margin:18mm 16mm 20mm;@bottom-left{{content:"Bloomwell Home Care · {html.escape(agreement.reference)}";font:9pt Arial;color:#5b6b60}}@bottom-right{{content:"Page " counter(page) " of " counter(pages);font:9pt Arial;color:#5b6b60}}}}
*{{box-sizing:border-box}}body{{font-family:Arial,Helvetica,sans-serif;color:#123524;font-size:10.5pt;line-height:1.5;margin:0}}header{{border-bottom:2px solid #C79A3B;box-shadow:0 5px 0 #123524;padding:0 0 16px;margin-bottom:26px}}.brand{{font-family:Georgia,'Times New Roman',serif;font-size:19pt;font-weight:700;color:#123524;letter-spacing:.02em}}.ref{{font-size:9pt;color:#9a7420;letter-spacing:.14em;font-weight:700}}h1{{font-family:Georgia,'Times New Roman',serif;font-size:18pt;color:#123524}}h2{{font-family:Georgia,'Times New Roman',serif;font-size:13pt;color:#123524;margin:20px 0 8px;padding-bottom:3px;border-bottom:1px solid #E9DDB8}}h3{{font-size:11pt;color:#2F6B4A;margin:12px 0 5px}}p{{white-space:pre-wrap}}.clause{{break-inside:avoid}}.party-details{{margin:10px 0 18px;padding:10px;border:1px solid #CBD8C6;border-top:3px solid #C79A3B;border-radius:4px}}.schedule,.certificate{{break-before:page}}table{{width:100%;border-collapse:collapse}}th,td{{padding:7px 9px;border-bottom:1px solid #CBD8C6;text-align:left;vertical-align:top}}th{{width:34%;color:#2F6B4A;background:#F3F8F1}}.sig{{display:inline-block;width:46%;vertical-align:top;margin:12px 2% 10px 0;min-height:100px;border-bottom:1px solid #6c7a72;padding:8px}}.signature{{display:block;max-width:220px;max-height:70px;object-fit:contain}}.verified-stamp{{border:1px solid #2F6B4A;background:#F3F8F1;color:#123524;padding:8px 10px;margin:6px 0;font-size:9pt;font-weight:bold;border-radius:4px}}.signature-list{{margin-top:20px;border-top:2px solid #C79A3B;padding-top:12px}}.banner{{background:#F4EBCB;color:#123524;border-left:4px solid #C79A3B;padding:12px;margin:0 0 16px;font-weight:bold}}.certificate{{break-before:page}}.intro{{color:#5b6b60;font-size:9.5pt;margin-top:4px}}.agreement-meta{{display:flex;gap:24px;margin-top:10px;font-size:9.5pt}}
@media screen{{body{{max-width:850px;margin:24px auto;padding:24px;background:#fff}}}}@media print{{.no-print{{display:none}}}}
</style></head><body><header><div class="brand">BLOOMWELL HOME CARE UGANDA LIMITED</div><div class="ref">CLIENT HOME NURSING SERVICE AGREEMENT · UNDER THE NEST MAMA PROGRAM</div><div class="intro">{html.escape(intro)}</div><div class="agreement-meta"><span>Agreement Reference: <strong>{html.escape(agreement.reference)}</strong></span><span>Date: <strong>{html.escape(agreement_date)}</strong></span></div></header>
{PRACTICE_BANNER if agreement.is_test else ''}{'<div class="banner">SIGNED AGREEMENT</div>' if signed else ''}{variation_html}{''.join(clause_html)}{''.join(schedule_html)}{certificate_html}</body></html>'''


def render_pdf(html_document: str) -> bytes:
    """Render vector text PDF. WeasyPrint is installed in the production backend image."""
    try:
        from weasyprint import HTML
    except ImportError as exc:  # fail closed; never create a fake/raster PDF
        raise RuntimeError("Vector PDF support is not installed. Deploy the WeasyPrint runtime packages.") from exc
    return HTML(string=html_document, base_url="https://bhcug.com/").write_pdf()


def make_certificate(agreement: Agreement, content_hash: str) -> dict[str, Any]:
    cert = {
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
        "verification_method": "email_or_sms_otp_and_" + "_and_".join(sorted({s.method for s in agreement.signatures}) or ["signature_capture"]),
        "signature_methods": {s.role: s.method for s in agreement.signatures},
        "ip_hash_prefix": next((s.ip_hash[:12] for s in agreement.signatures if s.ip_hash), None),
        "content_hash": content_hash,
        "electronic_signature_consent": next(
            (f"{s.esign_consent.get('version')}: {s.esign_consent.get('text')} (accepted {s.esign_consent.get('at')})"
             for s in agreement.signatures if s.esign_consent), None),
        "signers": [
            {
                "role": s.role, "name": s.name, "method": s.method, "signed_at": s.signed_at.isoformat(),
                "ip_address": s.ip_address, "user_agent": s.user_agent, "email": s.signer_email,
                "phone": s.signer_phone,
                "code_verified_at": s.otp_verified_at.isoformat() if s.otp_verified_at else None,
                "link_generation": s.link_generation, "link_token_hash_prefix": s.link_token_hash_prefix,
            }
            for s in agreement.signatures
        ],
        "sealed_at": datetime.now(UTC).isoformat(),
    }
    if agreement.is_test:
        cert = {"practice_agreement": "YES. Practice only; no legal effect.", **cert}
    return cert


def _money(currency: Any, amount: Any) -> str:
    try:
        return f"{currency or 'UGX'} {float(amount):,.0f}"
    except (TypeError, ValueError):
        return ""


# Answers the client gives online that have no line in the printed agreement. They are listed after the
# schedules so nothing that was collected is missing from the signed record.
_RECORD_SECTIONS = (
    ("Consent and communication recorded online", (
        ("Who makes care decisions", "schedule_c.decision_maker"),
        ("Consent to care", "schedule_c.care_consent"),
        ("Permissions and conditions", "schedule_c.permissions"),
        ("Initials", "schedule_c.initials"),
    )),
    ("Additional agreed particulars", (
        ("Rates", "schedule_b.rates"),
        ("Fees breakdown", "schedule_b.fees"),
        ("Payment instructions", "schedule_b.payment_details"),
        ("Organisation payer contact", "schedule_b.organisation_payer_contact"),
    )),
)


def _record_sections(values: dict[str, Any]) -> str:
    out: list[str] = []
    for title, rows in _RECORD_SECTIONS:
        body = []
        for label, path in rows:
            value = values.get(path)
            text = "" if value is None else str(value).strip()
            if text and text.upper() != "N/A":
                body.append(f"<tr><th>{html.escape(label)}</th><td>{html.escape(text)}</td></tr>")
        if body:
            out.append(f'<section class="record"><h2>{html.escape(title)}</h2><table>{"".join(body)}</table></section>')
    return "".join(out)


def _signature_lines(agreement: Agreement, signature_images: dict[str, bytes] | None) -> dict[str, dict[str, str]]:
    """What prints on the signature and date lines, by party (a representative signs as the client)."""
    lines: dict[str, dict[str, str]] = {}
    for signature in agreement.signatures:
        role = "bloomwell" if signature.role == "bloomwell" else "client"
        who = f"{signature.name} ({signature.role.title()})" if role == "client" and signature.role != "client" else signature.name
        lines[role] = {
            "html": f"{_signature_mark(signature, signature_images)}<small>{html.escape(who)} &middot; "
                    f"{signature.signed_at.strftime('%d %b %Y %H:%M UTC')}</small>",
            "date": signature.signed_at.strftime("%d %b %Y"),
        }
    return lines


def _review_legend(values: dict[str, Any], owners: dict[str, str]) -> str:
    still_empty = sum(1 for path, owner in owners.items()
                      if owner in ("staff", "clinical") and not str(values.get(path) or "").strip())
    status = (f"{still_empty} staff field{'s' if still_empty != 1 else ''} still empty." if still_empty
              else "All staff fields are filled.")
    return ('<div class="legend"><strong>REVIEW COPY for staff. Do not send this file to the client.</strong> '
            f'{status}<br><span class="key hl-needed">yellow</span>staff must fill (or mark N/A) before sending'
            '<span class="key hl-done">green</span>filled'
            '<span class="key hl-other">blue</span>the client fills in</div>')


def _render_blocks(agreement: Agreement, blocks: list[dict[str, Any]], *, signed: bool,
                   certificate: dict[str, Any] | None,
                   signature_images: dict[str, bytes] | None, highlight: bool = False) -> str:
    """Structured template path: typed values fill the original blanks, tick boxes and table cells."""
    values = {rules.field_path(key): field.value for key, field in agreement.fields.items()}
    computed = agreement.schedule_b_computed or {}
    currency = computed.get("currency", "UGX")
    created = agreement.created_at or datetime.now(UTC)
    meta = {
        "@reference": agreement.reference,
        "@date": created.strftime("%d %b %Y"),
        "@advance": _money(currency, computed["advance"]) if computed.get("advance") else "",
        "@balance": _money(currency, computed["balance"]) if computed.get("balance") else "",
    }
    banner = PRACTICE_BANNER if agreement.is_test else ""
    owners = {path: field.owner for path, field in ((rules.field_path(k), f) for k, f in agreement.fields.items())} if highlight else None
    if owners is not None:
        banner += _review_legend(values, owners)
    if agreement.variation_clause:
        banner += (f'<div class="banner">AMENDMENT — This agreement varies clause {html.escape(agreement.variation_clause)}. '
                   'The original completed agreement remains in effect except for the change expressly approved in this amendment.</div>')
    if signed:
        banner += '<div class="banner">SIGNED AGREEMENT</div>'
    extra = _record_sections(values)
    signatures = _signature_lines(agreement, signature_images)
    if certificate:
        extra += certificate_html(certificate)
    return block_renderer.document_html(blocks, values, meta, title=f"Bloomwell care agreement {agreement.reference}",
                                        banner=banner, extra=extra, signatures=signatures, highlight=owners)
