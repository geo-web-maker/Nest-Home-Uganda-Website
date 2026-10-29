import pytest

from app.modules.visits.photo_rules import missing_required_photo_evidence


def test_none_policy_never_blocks_checkout():
    assert not missing_required_photo_evidence("none", [])
    assert not missing_required_photo_evidence("none", ["other"])


def test_arrival_and_departure_policies_require_their_own_type():
    assert missing_required_photo_evidence("arrival", ["other", "departure"])
    assert not missing_required_photo_evidence("arrival", ["arrival"])
    assert missing_required_photo_evidence("departure", ["other", "arrival"])
    assert not missing_required_photo_evidence("departure", ["departure"])


def test_either_and_both_policies_are_distinct():
    assert missing_required_photo_evidence("either", ["other"])
    assert not missing_required_photo_evidence("either", ["arrival"])
    assert not missing_required_photo_evidence("either", ["departure"])
    assert missing_required_photo_evidence("both", ["arrival"])
    assert missing_required_photo_evidence("both", ["departure"])
    assert not missing_required_photo_evidence("both", ["arrival", "departure"])

def test_unknown_photo_requirement_fails_closed():
    with pytest.raises(ValueError):
        missing_required_photo_evidence("always", [])
