"""Re-apply the Schedule B payment option on top of the lawyer's template. Idempotent. Usage: payment_option.py <agreements_dir>"""
import json, sys, pathlib, re
d = pathlib.Path(sys.argv[1])

def sub(path, old, new, count=1):
    p = d / path; s = p.read_text()
    if new in s: return
    assert s.count(old) == count, (path, old[:50], s.count(old))
    p.write_text(s.replace(old, new))

# ---- rules.py
sub("rules.py", '''    "schedule_b.overtime_approval": "staff",
}''', '''    "schedule_b.overtime_approval": "staff",
    # Payment option: standard 50/50, a payment plan, or a plan the client already received.
    "schedule_b.payment_option": "staff", "schedule_b.payment_plan_details": "staff",
}''')
sub("rules.py", '''    "schedule_b.price_type": ("Fixed", "Estimate"),''', '''    "schedule_b.price_type": ("Fixed", "Estimate"),
    "schedule_b.payment_option": ("Standard 50/50", "Payment plan", "Plan already provided"),''')
sub("rules.py", '''def missing_staff_fields(fields: dict[str, AgreementField]) -> list[str]:
    """All staff/clinical-owned schedule entries must be filled or marked N/A before send."""
    missing: list[str] = []
    for path, owner in FIELD_OWNERS.items():
        if owner not in {"staff", "clinical"}:
            continue
''', '''def payment_option(value: Any) -> str:
    """'standard', 'plan' or 'already' from the stored answer. Blank, N/A or older drafts mean standard 50/50."""
    text = str(value or "").strip().lower()
    if text.startswith("plan already"):
        return "already"
    if text == "payment plan":
        return "plan"
    return "standard"


# Not asked for when the advance/balance rows are replaced by a payment plan.
_STANDARD_ONLY = frozenset({"schedule_b.advance_due_date", "schedule_b.balance_due_dates"})


def missing_staff_fields(fields: dict[str, AgreementField]) -> list[str]:
    """All staff/clinical-owned schedule entries must be filled or marked N/A before send."""
    missing: list[str] = []
    option_field = fields.get(field_key("schedule_b.payment_option"))
    option = payment_option(option_field.value if option_field else None)
    for path, owner in FIELD_OWNERS.items():
        if owner not in {"staff", "clinical"}:
            continue
        if path == "schedule_b.payment_option":  # blank means the standard 50/50 payment
            continue
        if path == "schedule_b.payment_plan_details" and option == "standard":
            continue
        if path in _STANDARD_ONLY and option != "standard":
            continue
''')

# ---- blocks.py
sub("blocks.py", '''    path = path.strip()
    raw = ctx["meta"].get(path) if path.startswith("@") else ctx["values"].get(path)
    if isinstance(raw, (list, tuple)):
        raw = ", ".join(str(x) for x in raw)
    text = "" if raw is None else str(raw).strip()
    if not text:
        return ""''', '''    path = path.strip()
    raw = ctx["meta"].get(path) if path.startswith("@") else ctx["values"].get(path)
    if isinstance(raw, (list, tuple)):
        raw = ", ".join(str(x) for x in raw)
    text = "" if raw is None else str(raw).strip()
    if path == "schedule_b.payment_option" and (not text or text.upper() == "N/A"):
        return "Standard 50/50"  # blank means the standard payment
    if not text:
        return ""''')
sub("blocks.py", '''    body: list[str] = []
    for key in sorted(rows):
        tds: list[str] = []
        for cell in rows[key]:''', '''    body: list[str] = []
    option = _payment_option(ctx)
    for key in sorted(rows):
        if any(option in (cell.get("hide") or []) for cell in rows[key]):
            continue  # e.g. the advance and balance rows when the client already has a payment plan
        tds: list[str] = []
        for cell in rows[key]:
            if option in (cell.get("alt") or {}):
                cell = {**cell, "lines": cell["alt"][option]}''')
sub("blocks.py", '''def _table_html(block''', '''def _payment_option(ctx: dict[str, Any]) -> str:
    text = _one(ctx, "schedule_b.payment_option").lower()
    return "already" if text.startswith("plan already") else "plan" if text == "payment plan" else "standard"


def _table_html(block''')

# ---- source_blocks.py
p = d / "source_blocks.py"; s = p.read_text()
i = s.index("r'''") + 4; j = s.rindex("'''")
blocks = json.loads(s[i:j])
if not any("Payment option" in "".join(r.get("t", "") for r in b.get("runs", [])) for b in blocks if b["type"] == "para"):
    k = next(n for n, b in enumerate(blocks) if b["type"] == "table" and any(
        "Advance Deposit" in "".join(r.get("t", "") for l in c["lines"] for r in l) for c in b["cells"]))
    t = blocks[k]
    def txt(c): return "".join(r.get("t", "") for l in c["lines"] for r in l)
    for c in t["cells"]:
        if c["r"] in (3, 4):
            c["hide"] = ["already"]
            if c["c"] == 1:
                c["alt"] = {"plan": [[{"k": "t", "t": "As set out in the payment plan below", "b": False}]]}
            if c["c"] == 2 and c["r"] == 3:
                c["alt"] = {"plan": [[{"k": "t", "t": "Non-refundable; credited against service fees. Subject to ", "b": False}, {"k": "t", "t": "Clause 8.8.", "b": False}]]}
            if c["c"] == 2 and c["r"] == 4:
                c["alt"] = {"plan": [[{"k": "t", "t": "Due dates as set out in the payment plan below.", "b": False}]]}
    opts = ["Standard 50/50", "Payment plan", "Plan already provided"]
    runs = [{"k": "t", "t": "Payment option (tick one): ", "b": True}]
    for o in opts:
        runs += [{"k": "box", "f": "schedule_b.payment_option", "kw": [], "o": o, "opts": opts}, {"k": "t", "t": o + "  ", "b": False}]
    base = {"type": "para", "page": t["page"], "align": "left", "indent": 0, "underline": False}
    blocks[k + 1:k + 1] = [
        {**base, "runs": runs},
        {**base, "runs": [{"k": "t", "t": "Payment plan details, or reference and date of the plan already given to the Client in writing: ", "b": True},
                          {"k": "blank", "n": 40, "f": "schedule_b.payment_plan_details"}]},
    ]
    new = json.dumps(blocks, ensure_ascii=False, separators=(",", ":"))
    assert "'''" not in new
    p.write_text(s[:i] + new + s[j:])
