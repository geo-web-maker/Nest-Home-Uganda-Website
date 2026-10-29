"""Stand-alone tests for approval checks; no database fixture is needed."""

from __future__ import annotations

import unittest

from app.modules.care_ops.procedure import approved_procedure_error


def procedure_text(
    *,
    steps: str = "Call responder; check staff safety.",
    escalation: str = "Call local emergency services when required.",
) -> str:
    return "\n".join(
        [
            "# SOS response procedure",
            "Version: 1.0",
            "Owner: Care operations",
            "Approved by: Designated owner",
            "Approval date: 2026-10-29",
            "Response target: Contact the responder within 5 minutes",
            "Responder steps:",
            steps,
            "Emergency escalation:",
            escalation,
            "Incident report deadline: Complete report within one working day",
            "Drill frequency: Quarterly",
            "Verified contacts: Checked 2026-10-29",
            "Status: APPROVED BY DESIGNATED OWNER — external checklist remains separate",
        ]
    )


class CareProcedureTests(unittest.TestCase):
    def test_complete_procedure_is_accepted_for_approval(self) -> None:
        self.assertIsNone(approved_procedure_error(procedure_text()))

    def test_approval_marker_does_not_make_placeholder_fields_valid(self) -> None:
        text = procedure_text().replace("Version: 1.0", "Version: [REQUIRED] please fill in")
        self.assertIn("Version is incomplete", approved_procedure_error(text) or "")

    def test_placeholder_in_section_is_rejected_even_with_extra_text(self) -> None:
        text = procedure_text(steps="[REQUIRED] add actual responder steps")
        self.assertIn("responder steps are incomplete", approved_procedure_error(text) or "")

    def test_empty_escalation_is_rejected(self) -> None:
        text = procedure_text(escalation="  ")
        self.assertIn("emergency escalation is incomplete", approved_procedure_error(text) or "")

    def test_unapproved_draft_is_not_treated_as_approval_attempt(self) -> None:
        self.assertIsNone(
            approved_procedure_error("Status: NOT APPROVED FOR LIVE USE\nVersion: [REQUIRED]")
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
