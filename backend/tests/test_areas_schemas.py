"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.areas.schemas import AreaIn, AreaUpdate


def _valid() -> dict:
    return {
        "name": "Sample",
        "sort_order": 1,
    }


def test_valid_area_payload_is_accepted() -> None:
    assert AreaIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        AreaIn()


def test_patch_accepts_only_changed_fields() -> None:
    assert AreaUpdate(**{"sort_order": 4}).model_dump(exclude_unset=True) == {"sort_order": 4}


def test_blank_area_name_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AreaIn(name="   ", sort_order=1)
    with pytest.raises(ValidationError):
        AreaUpdate(name="")
