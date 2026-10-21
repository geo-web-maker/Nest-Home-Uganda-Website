"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.pricing.schemas import PricingBlockIn, PricingBlockUpdate


def _valid() -> dict:
    return {
        "key": "assessment",
        "title": {"en": "Test title"},
        "show": True,
        "sort_order": 1,
    }


def test_valid_pricing_payload_is_accepted() -> None:
    assert PricingBlockIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        PricingBlockIn()


def test_english_title_is_required() -> None:
    payload = _valid()
    payload["title"] = {"lg": "Only local language"}
    with pytest.raises(ValidationError):
        PricingBlockIn(**payload)


def test_patch_accepts_only_changed_fields() -> None:
    assert PricingBlockUpdate(**{"sort_order": 4}).model_dump(exclude_unset=True) == {
        "sort_order": 4
    }


def test_patch_rejects_title_without_english() -> None:
    with pytest.raises(ValidationError):
        PricingBlockUpdate(title={"lg": "x"})
