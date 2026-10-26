from datetime import date

import pytest

from app.modules.visits.rules import VisitRuleError, current_place, move_client


def test_current_place_uses_half_open_boundaries():
    stays = [
        {"place_id": "a", "starts_on": date(2026, 1, 1), "ends_on": date(2026, 1, 10)},
        {"place_id": "b", "starts_on": date(2026, 1, 10), "ends_on": None},
    ]
    assert current_place(stays, date(2026, 1, 9))["place_id"] == "a"
    assert current_place(stays, date(2026, 1, 10))["place_id"] == "b"


def test_move_closes_open_stay_and_rejects_backdating():
    stays = [{"place_id": "a", "starts_on": date(2026, 1, 1), "ends_on": None}]
    moved = move_client(stays, "b", date(2026, 1, 5))
    assert moved[0]["ends_on"] == date(2026, 1, 5)
    assert moved[1]["place_id"] == "b"
    with pytest.raises(VisitRuleError):
        move_client(stays, "b", date(2025, 12, 31))
