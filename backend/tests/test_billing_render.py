import re

import pytest

from app.modules.billing import render


def sample(items=3):
    return {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0001",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "<script>alert(1)</script>", "address": "", "phone": "", "email": ""},
        "care_recipient": {"name": "Mrs. A. Nakato", "program": "Home care"},
        "items": [
            {
                "description": f"Care {i}",
                "quantity": 1,
                "unit_price_ugx": 100000,
                "amount_ugx": 100000,
            }
            for i in range(items)
        ],
        "total_ugx": items * 100000,
        "paid_ugx": 0,
        "balance_ugx": items * 100000,
        "document_date": "2026-11-13",
        "due_date": "2026-11-20",
        "payment_instructions": "Client to supply",
    }


def test_html_escapes_user_text_and_has_no_external_resources():
    html = render.document_html(sample(), "a" * 64, "ledger")
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>" not in html
    assert 'src="http' not in html and "@import" not in html and "url(http" not in html
    assert "<img" not in html


def test_ugx_formatting_uses_integer_values():
    assert render.money(410000) == "UGX 410,000"
    with pytest.raises(ValueError):
        render.money(1.5)


def test_logo_mark_paths_match_frontend_source():
    from pathlib import Path

    import pytest as _pytest

    frontend_mark = Path(__file__).parents[2] / "frontend/src/components/brand/markPaths.ts"
    if not frontend_mark.exists():  # e.g. the multi-site hoster has no frontend checkout
        _pytest.skip("frontend mark source not present in this checkout")
    source = frontend_mark.read_text()
    python_paths = re.findall(r'<path[^>]* d="([^"]+)"', render.NEST_MARK)
    assert len(python_paths) == 5
    for path in python_paths:
        assert path in source


@pytest.mark.parametrize("count", [1, 10, 60])
def test_slip_renders_as_a_single_page(count):
    markup = render.document_html(sample(count), "a" * 64, "slip")
    assert len(render.slip_document(markup, count).pages) == 1


def test_a4_table_header_repeats_and_last_group_cannot_split():
    html = render.document_html(sample(60), "a" * 64, "ledger")
    assert ".it thead{display:table-header-group}" in html
    assert ".it tr{break-inside:avoid}" in html
    assert ".last-block{break-inside:avoid}" in html


def test_paid_part_paid_void_and_practice_stamps_are_present():
    receipt = sample(1)
    receipt.update(
        {
            "doc_type": "receipt",
            "invoice_reference": "BHC-INV-2026-0001",
            "amount_ugx": 100000,
            "invoice_total_ugx": 200000,
            "balance_after_ugx": 100000,
            "method_label": "MTN Mobile Money",
            "payer_reference": "TX-123",
            "paid_on": "2026-11-13",
            "receipt_status": "PART PAID",
        }
    )
    part_paid = render.document_html(receipt, "a" * 64, "ledger")
    assert "PART PAID" in part_paid
    receipt["receipt_status"] = "PAID"
    assert "PAID" in render.document_html(receipt, "a" * 64, "ledger")
    assert "VOID -" in render.document_html(
        receipt, "a" * 64, "ledger", voided_at="2026-11-13T10:00:00+00:00"
    )
    receipt["is_test"] = True
    practice = render.document_html(receipt, "a" * 64, "ledger")
    assert "PRACTICE - NOT A REAL DOCUMENT" in practice


def test_a4_pdf_uses_vector_text_and_embedded_font_resources():
    from weasyprint import HTML

    markup = render.document_html(sample(3), "a" * 64, "ledger")
    document = HTML(string=markup).render()
    text_boxes = [
        box
        for page in document.pages
        for box in page._page_box.descendants()
        if hasattr(box, "text")
    ]
    assert any("Bloomwell" in box.text for box in text_boxes)
    pdf = render.render_pdf(sample(3), "a" * 64, "ledger")
    assert pdf.startswith(b"%PDF")
    # WeasyPrint 66 packs objects into compressed streams, so inspect an uncompressed render.
    raw = HTML(string=markup).write_pdf(uncompressed_pdf=True)
    assert b"/Font" in raw
    assert b"/Subtype /Image" not in raw


def _receipt():
    receipt = sample(1)
    receipt["items"][0]["service_date_text"] = "2022-12-11 to 2022-12-20"
    receipt.update(
        {
            "doc_type": "receipt",
            "reference": "BHC-RCT-2026-0001",
            "invoice_reference": "BHC-INV-2026-0001",
            "invoice_total_ugx": 100000,
            "paid_before_ugx": 20000,
            "amount_ugx": 30000,
            "balance_after_ugx": 50000,
            "paid_on": "2026-11-14",
            "document_date": "2026-11-14",
            "method_label": "Mtn Momo",
            "payer_reference": "101",
            "receipt_status": "PART PAID",
        }
    )
    return receipt


def test_service_dates_read_as_a_date_or_a_period_and_older_text_is_kept():
    assert render.service_label("2026-11-14") == ("Service date", "14 Nov 2026")
    assert render.service_label("2026-11-14 to 2026-11-20") == (
        "Service period",
        "14 Nov 2026 to 20 Nov 2026",
    )
    assert render.service_label("2026-11-14 to 2026-11-14") == ("Service date", "14 Nov 2026")
    assert render.service_label("11/12/2022") == ("Service", "11/12/2022")
    assert render.service_label("") == ("", "")


@pytest.mark.parametrize("layout", ["ledger", "slip"])
def test_service_date_sits_on_its_own_line_not_inside_the_description(layout):
    snapshot = sample(1)
    snapshot["items"][0]["service_date_text"] = "2026-11-14"
    html = render.document_html(snapshot, "a" * 64, layout)
    if layout == "ledger":
        assert 'Care 0<span class="svc">Service date: 14 Nov 2026</span>' in html
        assert ".svc{display:block" in html
    else:
        assert '<div class="isvc">14 Nov 2026</div>' in html


@pytest.mark.parametrize("layout", ["ledger", "slip"])
def test_receipt_has_the_payment_summary_in_both_layouts(layout):
    html = render.document_html(_receipt(), "a" * 64, layout)
    assert "Payment received" in html or "Amount received" in html
    assert "UGX 30,000" in html and "UGX 50,000" in html and "UGX 20,000" in html
    assert "11 Dec 2022 to 20 Dec 2022" in html


def test_receipt_payment_reference_and_date_are_on_separate_lines():
    html = render.document_html(_receipt(), "a" * 64, "ledger")
    assert "Reference: 101Paid on" not in html
    assert "Payment reference" in html and "Payment date" in html


def test_invoice_shows_agreement_reference_and_notes_when_present():
    snapshot = sample(1)
    snapshot.update({"agreement_reference": "BHC-2026-0007", "notes": "Pay by Friday"})
    html = render.document_html(snapshot, "a" * 64, "ledger")
    assert "BHC-2026-0007" in html and "Pay by Friday" in html
    plain = render.document_html(sample(1), "a" * 64, "ledger")
    assert "Agreement" not in plain and "Notes" not in plain
