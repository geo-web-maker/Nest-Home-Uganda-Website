"""Focused schema validation tests for the content module."""

import pytest
from pydantic import ValidationError

from app.modules.articles.schemas import ArticleIn, ArticleUpdate


def _valid() -> dict:
    return {
        "slug": "sample-article",
        "title": {"en": "Test title"},
    }


def test_valid_article_payload_is_accepted() -> None:
    assert ArticleIn(**_valid())


def test_required_fields_are_rejected_when_missing() -> None:
    with pytest.raises(ValidationError):
        ArticleIn()


def test_english_title_is_required() -> None:
    payload = _valid()
    payload["title"] = {"lg": "Only local language"}
    with pytest.raises(ValidationError):
        ArticleIn(**payload)


def test_invalid_image_media_id_is_rejected() -> None:
    payload = _valid()
    payload["image_media_id"] = "not-an-id"
    with pytest.raises(ValidationError):
        ArticleIn(**payload)


def test_patch_accepts_only_changed_fields() -> None:
    assert ArticleUpdate(slug="new-slug").model_dump(exclude_unset=True) == {"slug": "new-slug"}
