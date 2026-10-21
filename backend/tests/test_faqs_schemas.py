"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.faqs.schemas import FaqIn, FaqUpdate


def _valid() -> dict:
    return {
        "question": {"en": "Test question"},
        "answer": {"en": "Test answer"},
        "sort_order": 1,
        "published": True,
    }


def test_valid_faq_payload_is_accepted() -> None:
    assert FaqIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        FaqIn()


def test_english_question_is_required() -> None:
    payload = _valid()
    payload["question"] = {"lg": "Only local language"}
    with pytest.raises(ValidationError):
        FaqIn(**payload)


def test_invalid_service_id_is_rejected() -> None:
    payload = _valid()
    payload["service_id"] = "not-an-id"
    with pytest.raises(ValidationError):
        FaqIn(**payload)


def test_patch_accepts_only_changed_fields() -> None:
    assert FaqUpdate(**{"sort_order": 4}).model_dump(exclude_unset=True) == {"sort_order": 4}
