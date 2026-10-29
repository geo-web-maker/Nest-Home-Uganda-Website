"""Regression tests for safe, timezone-aware SOS responder selection.

Run standalone without a MongoDB fixture: ``PYTHONPATH=. python tests/test_care_roster.py``
from the backend directory.
"""
from __future__ import annotations

import unittest
from datetime import UTC, datetime

from app.modules.care_ops.roster import recipient_numbers, scheduled_numbers


class CareRosterTests(unittest.TestCase):
    def setUp(self) -> None:
        # 2026-10-29 is Thursday; 06:00 UTC is 09:00 in Africa/Kampala.
        self.now = datetime(2026, 10, 29, 6, 0, tzinfo=UTC)
        self.entry = {
            "name": "Primary responder",
            "phone": "+256700000001",
            "days": ["thu"],
            "start": "08:00",
            "end": "17:00",
            "override_phone": "",
            "override_until": "",
        }
        self.roster = {"enabled": True, "approved": True, "entries": [self.entry]}
        self.values = {
            "sos.on_call_contacts": {
                "Legacy primary": "+256700000002",
                "Legacy backup": "+256700000003",
            },
            "sos.on_call_roster": self.roster,
        }

    def test_approved_roster_routes_to_shift_responder(self) -> None:
        self.assertEqual(
            scheduled_numbers(self.roster, now=self.now, timezone_name="Africa/Kampala"),
            ["+256700000001"],
        )
        self.assertEqual(
            recipient_numbers(self.values, now=self.now, timezone_name="Africa/Kampala"),
            ["+256700000001"],
        )

    def test_shift_start_is_inclusive_and_end_is_exclusive(self) -> None:
        at_start = datetime(2026, 10, 29, 5, 0, tzinfo=UTC)  # 08:00 local
        at_end = datetime(2026, 10, 29, 14, 0, tzinfo=UTC)  # 17:00 local
        self.assertEqual(scheduled_numbers(self.roster, now=at_start), ["+256700000001"])
        self.assertEqual(scheduled_numbers(self.roster, now=at_end), [])

    def test_overnight_shift_matches_the_day_it_started_and_following_morning(self) -> None:
        overnight = {
            "enabled": True,
            "approved": True,
            "entries": [{**self.entry, "days": ["wed"], "start": "22:00", "end": "06:00"}],
        }
        wednesday_23_local = datetime(2026, 10, 28, 20, 0, tzinfo=UTC)
        thursday_05_local = datetime(2026, 10, 29, 2, 0, tzinfo=UTC)
        self.assertEqual(scheduled_numbers(overnight, now=wednesday_23_local), ["+256700000001"])
        self.assertEqual(scheduled_numbers(overnight, now=thursday_05_local), ["+256700000001"])

    def test_temporary_override_is_used_only_before_expiry(self) -> None:
        entry = {
            **self.entry,
            "override_phone": "+256700000009",
            "override_until": "2026-10-29T10:00:00+03:00",
        }
        roster = {**self.roster, "entries": [entry]}
        self.assertEqual(scheduled_numbers(roster, now=self.now), ["+256700000009"])
        expired = datetime(2026, 10, 29, 7, 1, tzinfo=UTC)
        self.assertEqual(scheduled_numbers(roster, now=expired), ["+256700000001"])

    def test_naive_override_expiry_uses_configured_roster_timezone(self) -> None:
        entry = {
            **self.entry,
            "override_phone": "+256700000009",
            # The HTML datetime-local control posts no UTC offset. This is 10:30 Kampala time.
            "override_until": "2026-10-29T10:30",
        }
        roster = {**self.roster, "entries": [entry]}
        self.assertEqual(scheduled_numbers(roster, now=self.now), ["+256700000009"])
        after_expiry = datetime(2026, 10, 29, 7, 31, tzinfo=UTC)
        self.assertEqual(scheduled_numbers(roster, now=after_expiry), ["+256700000001"])

    def test_unapproved_or_disabled_schedule_keeps_legacy_fallback(self) -> None:
        for roster in (
            {**self.roster, "enabled": False},
            {**self.roster, "approved": False},
        ):
            values = {**self.values, "sos.on_call_roster": roster}
            self.assertEqual(
                recipient_numbers(values, now=self.now, timezone_name="Africa/Kampala"),
                ["+256700000002", "+256700000003"],
            )

    def test_schedule_gap_falls_back_instead_of_silently_dropping_sos(self) -> None:
        roster = {**self.roster, "entries": [{**self.entry, "days": ["mon"]}]}
        values = {**self.values, "sos.on_call_roster": roster}
        self.assertEqual(scheduled_numbers(roster, now=self.now), [])
        self.assertEqual(
            recipient_numbers(values, now=self.now, timezone_name="Africa/Kampala"),
            ["+256700000002", "+256700000003"],
        )

    def test_duplicate_selected_numbers_are_sent_once(self) -> None:
        roster = {**self.roster, "entries": [self.entry, {**self.entry, "name": "Backup"}]}
        self.assertEqual(scheduled_numbers(roster, now=self.now), ["+256700000001"])

    def test_invalid_schedule_does_not_replace_fallback(self) -> None:
        roster = {**self.roster, "entries": [{**self.entry, "start": "invalid"}]}
        values = {**self.values, "sos.on_call_roster": roster}
        self.assertEqual(
            recipient_numbers(values, now=self.now, timezone_name="Africa/Kampala"),
            ["+256700000002", "+256700000003"],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
