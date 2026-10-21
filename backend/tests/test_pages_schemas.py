"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.pages.schemas import ContentPageIn, ContentPageUpdate


def _valid() -> dict:
    return {
        "key": "about-story",
        "title": {"en": "Test title"},
        "published": True,
    }


def test_valid_page_payload_is_accepted() -> None:
    assert ContentPageIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        ContentPageIn()


def test_english_title_is_required() -> None:
    payload = _valid()
    payload["title"] = {"lg": "Only local language"}
    with pytest.raises(ValidationError):
        ContentPageIn(**payload)


def test_patch_accepts_only_changed_fields() -> None:
    assert ContentPageUpdate(published=False).model_dump(exclude_unset=True) == {"published": False}


@pytest.mark.parametrize("key", ["about_story", "about_credentials", "privacy"])
def test_spec_page_keys_are_accepted(key: str) -> None:
    assert ContentPageIn(**{**_valid(), "key": key}).key == key


@pytest.mark.parametrize("key", ["About", "a b", "-x", "x_", "x__y", "../etc"])
def test_malformed_page_keys_are_rejected(key: str) -> None:
    with pytest.raises(ValidationError):
        ContentPageIn(**{**_valid(), "key": key})


def test_published_defaults_to_draft() -> None:
    assert ContentPageIn(key="x", title={"en": "T"}).published is False
