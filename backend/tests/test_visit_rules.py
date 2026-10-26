import pytest

from app.modules.visits.rules import VisitRuleError, make_snapshot, next_status


def test_snapshot_does_not_mutate_when_place_changes():
    place = {"address_text": "One Road", "lat": 1.0, "lng": 2.0, "radius_m": 150}
    snapshot = make_snapshot(place)
    place["lat"] = 8.0
    assert snapshot["lat"] == 1.0


def test_state_transitions():
    assert next_status({"status": "scheduled"}, "check_in") == "in_progress"
    assert next_status({"status": "missed"}, "check_in") == "in_progress"
    assert next_status({"status": "in_progress"}, "check_out") == "completed"
    for status, event in [
        ("in_progress", "check_in"),
        ("scheduled", "check_out"),
        ("cancelled", "check_in"),
        ("completed", "check_out"),
    ]:
        with pytest.raises(VisitRuleError):
            next_status({"status": status}, event)
