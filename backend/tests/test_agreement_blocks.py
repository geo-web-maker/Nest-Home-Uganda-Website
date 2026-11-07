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
        paths.update(p for p in spec.split("+") if not p.startswith("@"))
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
