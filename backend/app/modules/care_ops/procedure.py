"""Pure validation for a written SOS procedure before it is marked approved."""
from __future__ import annotations

import re

_REQUIRED_FIELDS = (
    "Version",
    "Owner",
    "Approved by",
    "Approval date",
    "Response target",
    "Incident report deadline",
    "Drill frequency",
    "Verified contacts",
)
_PLACEHOLDER = re.compile(r"\[(?:REQUIRED|NOT APPROVED)\]", re.IGNORECASE)


def approved_procedure_error(value: str) -> str | None:
    """Return a useful validation error when an approval-marked procedure is incomplete."""
    if not re.search(
        r"^Status:\s*APPROVED BY DESIGNATED OWNER\b",
        value,
        re.IGNORECASE | re.MULTILINE,
    ):
        return None

    for label in _REQUIRED_FIELDS:
        match = re.search(rf"^{re.escape(label)}:\s*(.*?)\s*$", value, re.IGNORECASE | re.MULTILINE)
        if not match or not match.group(1).strip() or _PLACEHOLDER.search(match.group(1)):
            return f"SOS procedure cannot be approved: {label} is incomplete"

    sections = (
        ("Responder steps", "Emergency escalation"),
        ("Emergency escalation", "Incident report deadline"),
    )
    for heading, next_heading in sections:
        match = re.search(
            rf"^{re.escape(heading)}:\s*\n([\s\S]*?)\n{re.escape(next_heading)}:",
            value,
            re.IGNORECASE | re.MULTILINE,
        )
        if not match or len(match.group(1).strip()) < 3 or _PLACEHOLDER.search(match.group(1)):
            verb = "are" if heading == "Responder steps" else "is"
            return f"SOS procedure cannot be approved: {heading.lower()} {verb} incomplete"
    return None
