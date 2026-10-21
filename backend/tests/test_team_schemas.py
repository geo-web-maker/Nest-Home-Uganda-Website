"""Focused validation tests for team member payloads."""

import pytest
from pydantic import ValidationError

from app.modules.team.schemas import TeamMemberIn, TeamMemberUpdate


def payload() -> dict:
    return {
        "name": "Nurse A",
        "role": {"en": "Role supplied by client"},
        "qualification": {"en": "Qualification supplied by client"},
        "bio": {},
        "photo_media_id": None,
        "sort_order": 1,
        "published": False,
    }


def test_valid_team_member_is_accepted() -> None:
    assert TeamMemberIn(**payload()).name == "Nurse A"


def test_blank_name_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TeamMemberIn(**{**payload(), "name": " "})


def test_photo_media_id_must_be_an_object_id() -> None:
    with pytest.raises(ValidationError):
        TeamMemberIn(**{**payload(), "photo_media_id": "wrong"})


def test_patch_keeps_only_supplied_fields() -> None:
    assert TeamMemberUpdate(sort_order=3).model_dump(exclude_unset=True) == {"sort_order": 3}


def test_patch_rejects_invalid_photo_id() -> None:
    with pytest.raises(ValidationError):
        TeamMemberUpdate(photo_media_id="bad-id")
