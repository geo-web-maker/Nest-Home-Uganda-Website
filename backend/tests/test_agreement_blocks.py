"""Structured agreement template: wording fidelity, field bindings and rendering."""
import re

from app.modules.agreements import blocks as block_renderer, rules
from app.modules.agreements.source_blocks import SOURCE_BLOCKS
from app.modules.agreements.source_template import SOURCE_CLAUSES

SKIP = {"Agreement introduction", "Schedule A", "Schedule B", "Schedule C", "1.2"}  # 1.2 interleaves form labels


def _norm(text: str) -> list[str]:
    return re.sub(r"[\W_]+", " ", text.replace("’", "'")).lower().split()


def _block_text() -> str:
    parts: list[str] = []
    for block in SOURCE_BLOCKS:
        parts += [r["t"] for r in block.get("runs", []) if r["k"] == "t"]
        for cell in block.get("cells", []):
            parts += [r["t"] for line in cell["lines"] for r in line if r["k"] == "t"]
    return " ".join(_norm(" ".join(parts)))


def _bound_paths() -> set[str]:
    paths: set[str] = set()
    def add(spec: str) -> None:
        paths.update(p for p in re.split(r"[+|~&,]", spec) if p and not p.startswith("@"))
    for block in SOURCE_BLOCKS:
        for run in block.get("runs", []):
            if run.get("f"): add(run["f"])
        for cell in block.get("cells", []):
            if cell.get("f"): add(cell["f"])
            for line in cell["lines"]:
                for run in line:
                    if run.get("f"): add(run["f"])
    return paths


def test_every_clause_wording_is_in_the_blocks():
    text = _block_text()
    for key, wording in SOURCE_CLAUSES.items():
        if key in SKIP:
            continue
        words = _norm(f"{key} {wording}" if key.endswith(".0") else wording)
        assert " ".join(words) in text, f"clause {key} differs from the structured template"


def test_email_corrections_survive():
    text = _block_text()
    assert "info bhcug com" in text and "wellnesthomecareug" not in text


def test_every_bound_field_exists():
    unknown = _bound_paths() - set(rules.FIELD_OWNERS)
    assert not unknown, f"blocks bind unknown fields: {sorted(unknown)}"


def test_hash_covers_layout():
    assert rules.template_hash(SOURCE_CLAUSES, SOURCE_BLOCKS) != rules.template_hash(SOURCE_CLAUSES)
    changed = [dict(b) for b in SOURCE_BLOCKS]
    changed[0] = {**changed[0], "align": "left"}
    assert rules.template_hash(SOURCE_CLAUSES, changed) != rules.template_hash(SOURCE_CLAUSES, SOURCE_BLOCKS)


def test_values_fill_blanks_ticks_and_cells():
    values = {"client.name": "Grace Nakato", "schedule_a.coverage_arrangement": "Day shifts",
              "schedule_a.care_plan": "Newborn care", "schedule_b.currency": "UGX"}
    meta = {"@reference": "BHC-2026-0001", "@date": "07 Nov 2026", "@advance": "UGX 600,000", "@balance": "UGX 600,000"}
    page = block_renderer.document_html(SOURCE_BLOCKS, values, meta, title="t")
    assert "Grace Nakato" in page and "Newborn care" in page and "BHC-2026-0001" in page
    assert page.count('class="box on"') == 2          # day shifts + UGX
    assert "UGX 600,000" in page and "Booking Fee" in page


META = {"@reference": "BHC-2026-0001", "@date": "07 Nov 2026", "@advance": "", "@balance": ""}


def _page(values: dict) -> str:
    return block_renderer.document_html(SOURCE_BLOCKS, values, META, title="t")


def _text(page: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page))


def test_every_tick_box_names_its_option_and_matches_the_registry():
    boxes = [run for block in SOURCE_BLOCKS for run in block.get("runs", []) if run["k"] == "box"]
    assert boxes
    for run in boxes:
        assert run["f"] in rules.CHOICE_FIELDS, run["f"]
        assert tuple(run["opts"]) == rules.CHOICE_FIELDS[run["f"]]
        assert run["o"] in run["opts"]


def test_a_choice_ticks_exactly_its_own_box():
    for option in rules.CHOICE_FIELDS["schedule_a.coverage_arrangement"]:
        page = _page({"schedule_a.coverage_arrangement": option})
        assert page.count('class="box on"') == 1
    # Information permitted contains the word "care", but only its own box is ticked.
    page = _page({"schedule_c.information_permitted": "Agreed care updates"})
    assert page.count('class="box on"') == 1


def test_older_free_text_answers_still_tick_by_keyword():
    assert _page({"schedule_a.coverage_arrangement": "night"}).count('class="box on"') == 1
    assert _page({"schedule_c.decision_maker": "The patient personally"}).count('class="box on"') == 1
    assert _page({"schedule_c.decision_maker": "Next of kin with lawful authority"}).count('class="box on"') == 1


def test_money_dates_and_labelled_cells_read_clearly():
    page = _page({
        "schedule_b.currency": "UGX", "schedule_b.total_fee": "2080000", "schedule_b.assessment_fee": "30000",
        "schedule_b.nursing_visit_shift": "80000", "schedule_b.price_basis": "Per day",
        "schedule_b.price_type": "Estimate", "schedule_b.tax_treatment": "Inclusive",
        "schedule_b.transport_basis": "Included", "schedule_b.overtime_approval": "Yes",
        "schedule_b.consumables_items": "Dressings", "schedule_b.equipment_inventory_ref": "INV-7",
        "schedule_a.shift_start_end_times": "08:00-16:00",
        "schedule_a.care_start_date": "2026-11-10", "schedule_a.care_end_review_date": "2026-12-10",
    })
    text = _text(page)
    for expected in ("UGX 2,080,000", "UGX 30,000", "UGX 80,000 per day", "Fixed / Estimate: Estimate",
                     "Inclusive / Exempt / Additional: Inclusive", "Included / Additional: Included",
                     "Prior Approval Required: Yes", "Included Items: Dressings", "Inventory Reference: INV-7",
                     "Hours / Duration: 08:00-16:00", "Care Starts: 10 Nov 2026"):
        assert expected in text, expected
    # With no billing dates, the service period falls back to the Schedule A care dates.
    assert "Service Period: 10 Nov 2026 \u2013 10 Dec 2026" in text


def test_patient_age_and_language_come_from_parties_first():
    text = _text(_page({"patient.dob_or_age": "3 weeks", "schedule_a.patient_dob_or_age": "old",
                        "patient.language": "Luganda"}))
    assert "Date of Birth / Age: 3 weeks" in text and "Preferred Language: Luganda" in text
    assert "Date of Birth / Age: old" in _text(_page({"schedule_a.patient_dob_or_age": "old"}))


def test_paragraphs_split_at_page_breaks_are_whole_again():
    text = _text(_page({}))
    assert "seek appropriate emergency assistance" in text
    assert "waiting time and consider patient safety" in text
    assert "earlier understanding on the same subject" in text
    assert "described in Schedule A has been explained" in text


def test_consent_statement_names_the_person_consenting():
    assert "I, Mrs Rep confirm" in _text(_page({"schedule_c.representative_name": "Mrs Rep", "client.name": "Client"}))
    assert "I, Client confirm" in _text(_page({"client.name": "Client"}))


def test_schedule_headings_are_one_banner_with_its_subtitle():
    page = _page({})
    assert page.count('class="p c sch"') + page.count('class="p sch"') >= 3 or "p sch" in page
    assert page.count("sch-sub") >= 3


def test_registry_choice_validation():
    assert rules.choice_error("schedule_a.coverage_arrangement", "Day shifts") is None
    assert rules.choice_error("schedule_a.coverage_arrangement", "Whenever") is not None
    assert rules.choice_error("schedule_a.coverage_arrangement", "N/A") is None
    assert rules.choice_error("schedule_a.coverage_arrangement", "") is None
    assert rules.choice_error("schedule_c.decision_maker", "N/A") is not None
    # Re-saving an answer stored before the options existed does not fail.
    assert rules.choice_error("schedule_c.decision_maker", "The patient personally", "The patient personally") is None
    assert rules.choice_error("schedule_a.care_plan", "anything") is None
    assert set(rules.CHOICE_FIELDS) <= set(rules.FIELD_OWNERS)


def _owners() -> dict[str, str]:
    return dict(rules.FIELD_OWNERS)


def test_review_copy_marks_empty_staff_spots_and_filled_spots():
    values = {"schedule_a.care_start_date": "2026-01-01"}
    html_out = block_renderer.document_html(SOURCE_BLOCKS, values, {}, title="t", highlight=_owners())
    assert "hl-needed" in html_out and "hl-done" in html_out and "hl-other" in html_out
    assert "hl-needed" not in block_renderer.document_html(SOURCE_BLOCKS, values, {}, title="t")


def test_review_copy_counts_na_as_filled():
    every = {path: "N/A" for path, owner in rules.FIELD_OWNERS.items() if owner in ("staff", "clinical")}
    html_out = block_renderer.document_html(SOURCE_BLOCKS, every, {}, title="t", highlight=_owners())
    assert "hl-needed" not in html_out.split("</style>", 1)[1]


def test_fields_without_a_line_in_the_printed_agreement():
    """Keep NOT_IN_FORM in frontend/src/features/agreements/fieldMeta.ts equal to this set."""
    assert set(rules.FIELD_OWNERS) - block_renderer.referenced_paths(SOURCE_BLOCKS) == {
        "schedule_b.fees", "schedule_b.rates", "schedule_b.payment_details", "schedule_b.organisation_payer_contact",
        "schedule_c.permissions", "schedule_c.care_consent", "schedule_c.initials",
    }
