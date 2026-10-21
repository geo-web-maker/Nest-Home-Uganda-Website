"""Focused media schema tests. Upload validation belongs to the protected implementation task."""

import pytest
from pydantic import ValidationError

from app.modules.media.schemas import MediaIn, MediaUpdate


def valid() -> dict:
    return {
        "storage_key": "media/sample.jpg",
        "public_url": "",
        "mime": "image/jpeg",
        "size_bytes": 10,
    }


def test_valid_metadata_is_accepted() -> None:
    assert MediaIn(**valid()).size_bytes == 10


def test_negative_size_is_rejected() -> None:
    with pytest.raises(ValidationError):
        MediaIn(**{**valid(), "size_bytes": -1})


def test_negative_width_is_rejected() -> None:
    with pytest.raises(ValidationError):
        MediaIn(**{**valid(), "width": -1})


def test_alt_text_patch_keeps_only_supplied_fields() -> None:
    assert MediaUpdate(alt_text={"en": "A supplied image description"}).model_dump(
        exclude_unset=True
    ) == {"alt_text": {"en": "A supplied image description"}}


def test_empty_storage_key_is_rejected() -> None:
    with pytest.raises(ValidationError):
        MediaIn(**{**valid(), "storage_key": " "})
