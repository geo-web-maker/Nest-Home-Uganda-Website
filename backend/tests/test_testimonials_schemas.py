"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.testimonials.schemas import TestimonialIn, TestimonialUpdate


def _valid() -> dict:
    return {
        "first_name": "Sample",
        "area": "Sample",
        "quote": {"en": "Test quote"},
        "permission_received": True,
        "approved": True,
    }


def test_valid_testimonial_payload_is_accepted() -> None:
    assert TestimonialIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        TestimonialIn()


def test_patch_accepts_only_changed_fields() -> None:
    assert TestimonialUpdate(approved=False).model_dump(exclude_unset=True) == {"approved": False}
