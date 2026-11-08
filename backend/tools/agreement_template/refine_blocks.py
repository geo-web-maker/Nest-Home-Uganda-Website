"""Refine the structured agreement template (SOURCE_BLOCKS) without touching its legal wording.

The blocks were extracted once from the owner-supplied PDF. This script applies a fixed, repeatable set of
structure fixes and rewrites source_blocks.py:

* joins paragraphs the PDF extraction split at page breaks (clauses 7.1, 9.3, 15.1, the care-consent
  statement and the interpreter certificate);
* binds every tick box to its exact option label ("o") and to the full option list ("opts"), so a choice
  field ticks exactly one box instead of relying on keyword guesses;
* binds every label that had no field (Hours / Duration, Service Period, Included / Additional, Included
  Items, Inventory Reference, Prior Approval Required, Inclusive / Exempt / Additional, Fixed / Estimate)
  to a real field;
* removes stray continuation lines and leftover blanks that stayed empty even when the form was complete.

Safety net: the visible wording (all text runs, whitespace ignored) must be identical before and after.
Run from the backend directory:   python tools/agreement_template/refine_blocks.py <path to source_blocks.py> [...]
The script is idempotent: running it on an already refined file changes nothing.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

CHOICES = {
    "schedule_a.coverage_arrangement": ["Scheduled visits", "Day shifts", "Night shifts", "Continuous care by roster"],
    "schedule_c.decision_maker": ["Patient with capacity", "Parent/Guardian", "Other lawful representative"],
    "schedule_c.communication_channel": ["Telephone", "SMS", "Email", "WhatsApp", "Other"],
    "schedule_c.information_permitted": ["Booking / billing only", "Agreed care updates", "Other"],
    "schedule_b.currency": ["UGX", "USD"],
}

HEADER = '''"""Structured source agreement (blocks) extracted once from the owner-supplied PDF.

Generated from the source PDF and refined by tools/agreement_template/refine_blocks.py. Do not hand-edit:
change the refine script and regenerate."""
import json

SOURCE_BLOCKS = json.loads(r\'\'\''''


def load(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    start = text.index("json.loads(r'''") + len("json.loads(r'''")
    end = text.rindex("''')")
    return json.loads(text[start:end])


def visible_text(blocks: list[dict]) -> str:
    out: list[str] = []
    for block in blocks:
        if block["type"] == "para":
            out.extend(r["t"] for r in block["runs"] if r["k"] == "t")
        else:
            for cell in block["cells"]:
                for line in cell["lines"]:
                    out.extend(r["t"] for r in line if r["k"] == "t")
    return re.sub(r"\s+", "", "".join(out))


def para_text(block: dict) -> str:
    return "".join(r.get("t", "") for r in block.get("runs", []))


def find_para(blocks: list[dict], startswith: str, *, after: int = 0) -> int:
    for i in range(after, len(blocks)):
        if blocks[i]["type"] == "para" and para_text(blocks[i]).strip().startswith(startswith):
            return i
    raise LookupError(f"paragraph starting {startswith!r} not found")


def merge_next(blocks: list[dict], index: int) -> None:
    """Join block[index+1] onto block[index] (a paragraph the PDF split at a page break)."""
    first, second = blocks[index], blocks.pop(index + 1)
    runs = first["runs"]
    if runs and second["runs"] and runs[-1]["k"] == "t" and second["runs"][0]["k"] == "t":
        if not runs[-1]["t"].endswith(" ") and not second["runs"][0]["t"].startswith(" "):
            runs.append({"k": "t", "t": " ", "b": False})
    runs.extend(second["runs"])


def set_blank_field(runs: list[dict], label_start: str, field: str) -> bool:
    """Give the first unbound blank after the text run starting with label_start a field."""
    seen = False
    for run in runs:
        if run["k"] == "t" and run["t"].strip().startswith(label_start):
            seen = True
        elif seen and run["k"] == "blank" and not run.get("f"):
            run["f"] = field
            return True
    return False


def bind_boxes(blocks: list[dict]) -> None:
    for block in blocks:
        if block["type"] != "para":
            continue
        runs = block["runs"]
        fields = {r["f"] for r in runs if r["k"] == "box"}
        for field in fields:
            options = CHOICES.get(field)
            boxes = [r for r in runs if r["k"] == "box" and r["f"] == field]
            if not options or len(options) != len(boxes):
                continue
            for run, option in zip(boxes, options):
                run["o"] = option
                run["opts"] = options


def apply(blocks: list[dict]) -> list[dict]:
    # 1. Paragraphs split at page breaks.
    for start in ("7.1.", "9.3.", "15.1."):
        i = find_para(blocks, start)
        if not para_text(blocks[i]).rstrip().endswith((".", ":", ";")):
            merge_next(blocks, i)
    i = find_para(blocks, "I, ")
    if para_text(blocks[i + 1]).startswith("A has been explained"):
        merge_next(blocks, i)
    # The consent statement ends "...legal rights. Patient / Lawful Representative Name: ____": the name
    # line is a field of its own, not part of the statement.
    i = find_para(blocks, "I, ")
    marker = "Patient / Lawful Representative Name: "
    runs = blocks[i]["runs"]
    for pos, run in enumerate(runs):
        if run["k"] == "t" and marker in run["t"]:
            before, _, _after = run["t"].partition(marker)
            run["t"] = before.rstrip() + " "
            name_line = {"type": "para", "page": blocks[i]["page"], "align": "left", "indent": 0, "underline": False,
                         "runs": [{"k": "t", "t": marker, "b": False},
                                  {"k": "blank", "n": 71, "f": "schedule_c.representative_name|patient.full_name|client.name"}]}
            runs[pos + 1:] = []
            blocks.insert(i + 1, name_line)
            break
    # "I, ____ confirm": the person confirming is the patient or lawful representative.
    for run in blocks[find_para(blocks, "I, ")]["runs"]:
        if run["k"] == "blank" and run.get("f") == "client.name":
            run["f"] = "schedule_c.representative_name|patient.full_name|client.name"
    # Interpreter certificate: "... in ____ language, and ... thumbprinting." then Name / Address / Contact lines.
    i = find_para(blocks, "I accurately read over")
    if para_text(blocks[i + 1]).startswith("language, and the signatory"):
        nxt = blocks[i + 1]
        name_at = next(p for p, r in enumerate(nxt["runs"]) if r["k"] == "t" and r["t"].strip() == "Name:")
        head, tail = nxt["runs"][:name_at], nxt["runs"][name_at:]
        blocks[i]["runs"].append({"k": "t", "t": " ", "b": False})
        blocks[i]["runs"].extend(head)
        blocks[i + 1] = {"type": "para", "page": nxt["page"], "align": "left", "indent": 0,
                         "underline": False, "runs": tail}

    # 1b. Any other clause the PDF cut at a page break: a paragraph that stops mid-sentence is continued by the
    # next block unless that block starts a new numbered clause ("13.2. ...").
    start = find_para(blocks, "1.3.")
    end = find_para(blocks, "SCHEDULE A")
    clause_start = re.compile(r"^\d{1,2}\.(?:0|\d{1,2})\.(?!\d)\s*\S")
    i = start
    while i < end - 1:
        here, nxt = para_text(blocks[i]).strip(), para_text(blocks[i + 1]).strip()
        orphan_number = re.fullmatch(r"\d{1,2}\.\d{1,2}\.?", nxt) is not None
        unfinished = here and here[-1] not in ".:;)\u201d\""
        if unfinished and (orphan_number or not clause_start.match(nxt)):
            merge_next(blocks, i)
            end -= 1
        else:
            i += 1

    # 2. Stray leftovers: dotted continuation lines and an unbound trailing blank.
    for startswith in ("BLOOMWELL Insurance Details Expressly Represented",):
        i = find_para(blocks, startswith)
        blocks[i]["runs"] = [r for r in blocks[i]["runs"] if not (r["k"] == "blank" and not r.get("f"))]
    i = find_para(blocks, "Agreed Variations Identifying")
    if blocks[i + 1]["type"] == "para" and all(r["k"] == "blank" and not r.get("f") for r in blocks[i + 1]["runs"]):
        blocks.pop(i + 1)
    i = find_para(blocks, "People authorized to receive routine care updates")
    if blocks[i + 1]["type"] == "para" and all(r["k"] == "blank" and not r.get("f") for r in blocks[i + 1]["runs"]):
        blocks.pop(i + 1)

    # 3. Schedule A: one source of truth for the patient's age and language (Parties, then Schedule A).
    i = find_para(blocks, "Date of Birth / Age")
    for run in blocks[i]["runs"]:
        if run["k"] == "blank" and run.get("f") == "schedule_a.patient_dob_or_age":
            run["f"] = "patient.dob_or_age|schedule_a.patient_dob_or_age"
        if run["k"] == "blank" and run.get("f") == "schedule_a.language":
            run["f"] = "patient.language|schedule_a.language"

    # 4. Tables: bind the labelled-but-empty cells.
    tables = [b for b in blocks if b["type"] == "table"]
    fee_tables = [t for t in tables if t["cols"] == [156, 103, 218]]
    bindings = {
        "Hours / Duration:": "schedule_a.shift_start_end_times",
        "Service Period:": "schedule_b.start_date~schedule_b.end_date|schedule_a.care_start_date~schedule_a.care_end_review_date",
        "Included / Additional:": "schedule_b.transport_basis",
        "Included Items:": "schedule_b.consumables_items",
        "Inventory Reference:": "schedule_b.equipment_inventory_ref",
        "Prior Approval Required:": "schedule_b.overtime_approval",
        "Inclusive / Exempt / Additional:": "schedule_b.tax_treatment",
        "Fixed / Estimate:": "schedule_b.price_type",
    }
    for table in fee_tables:
        for cell in table["cells"]:
            first = cell["lines"][0] if cell["lines"] else []
            label = next((r["t"].strip() for r in first if r["k"] == "t" and r["t"].strip()), "")
            if label in bindings:
                blanks = [r for line in cell["lines"] for r in line if r["k"] == "blank"]
                if blanks:
                    blanks[0]["f"] = bindings[label]
                else:
                    first.append({"k": "t", "t": " ", "b": False})
                    first.append({"k": "blank", "n": 14, "f": bindings[label]})
            # The tax answer belongs next to "Inclusive / Exempt / Additional", not in the rate column.
            if cell.get("f") == "schedule_b.tax_treatment":
                cell["f"] = None
            if cell.get("f") == "schedule_b.nursing_visit_shift":
                cell["f"] = "schedule_b.nursing_visit_shift&schedule_b.price_basis"

    bind_boxes(blocks)
    mark_signature_lines(blocks)
    tidy_specs_and_spacing(blocks)
    return blocks


def mark_signature_lines(blocks: list[dict]) -> None:
    """Tag the signature and date blanks ("s" = role whose signature prints there, "d" = role whose signing date)."""
    def tag(block: dict, keys: list[tuple[str, str]]) -> None:
        blanks = [r for r in block["runs"] if r["k"] == "blank" and not r.get("f")]
        for run, (key, role) in zip(blanks, keys):
            run[key] = role

    paras = [(i, para_text(b).strip()) for i, b in enumerate(blocks) if b["type"] == "para"]
    first = next(i for i, t in paras if t.startswith("Client Signature"))
    tag(blocks[first], [("s", "client"), ("s", "bloomwell")])
    tag(blocks[first + 1], [("d", "client")])
    consent = next(i for i, t in paras if t.startswith("Signature / Thumbprint"))
    tag(blocks[consent], [("s", "client"), ("d", "client")])
    final = [i for i, t in paras if t.startswith("Signature / Thumbprint")][1]
    tag(blocks[final], [("s", "client"), ("d", "client")])
    tag(blocks[final + 2], [("s", "bloomwell"), ("d", "bloomwell")])


def all_line_lists(blocks: list[dict]):
    for block in blocks:
        if block["type"] == "para":
            yield block["runs"]
        else:
            for cell in block["cells"]:
                yield from cell["lines"]


def tidy_specs_and_spacing(blocks: list[dict]) -> None:
    """Join multi-field blanks with commas (title + name stay space-joined) and keep a space after a filled blank."""
    for runs in all_line_lists(blocks):
        for run in runs:
            spec = run.get("f")
            if spec and "+" in spec and not spec.startswith("client.title"):
                run["f"] = spec.replace("+", ",")
        for run, nxt in zip(runs, runs[1:]):
            if run["k"] in ("blank", "calc") and nxt["k"] == "t" and nxt["t"] and not nxt["t"][0].isspace() \
                    and nxt["t"][0] not in ".,;:)":
                nxt["t"] = " " + nxt["t"]
    for block in blocks:
        if block["type"] == "table":
            for cell in block["cells"]:
                spec = cell.get("f")
                if spec and "+" in spec:
                    cell["f"] = spec.replace("+", ",")


def write(path: Path, blocks: list[dict]) -> None:
    body = json.dumps(blocks, ensure_ascii=False, separators=(",", ":"))
    assert "'''" not in body
    path.write_text(HEADER + body + "''')\n", encoding="utf-8")


def main(paths: list[str]) -> None:
    for name in paths:
        path = Path(name)
        blocks = load(path)
        before = visible_text(blocks)
        refined = apply(json.loads(json.dumps(blocks)))
        after = visible_text(refined)
        if before != after:
            raise SystemExit(f"{path}: refinement changed the agreement wording; aborting")
        write(path, refined)
        print(f"{path}: {len(blocks)} -> {len(refined)} blocks, wording unchanged")


if __name__ == "__main__":
    main(sys.argv[1:])
