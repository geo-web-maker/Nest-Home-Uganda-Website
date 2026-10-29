"""Validation boundaries for per-client photo guidance."""

import pytest
from pydantic import ValidationError

from app.modules.care_admin.router import ClientIn


def _client_payload(**extra):
    payload = {
        "id": "client-guidance-001",
        "display_name": "Client Example",
        "notes_for_nurse": "",
        "supervisor_id": None,
        "assigned_nurse_ids": [],
        "photo_allowed": True,
        "photo_required": None,
    }
    payload.update(extra)
    return payload


def test_client_photo_guidance_is_optional_and_preserves_explicit_empty_override():
    assert ClientIn.model_validate(_client_payload()).photo_guidance_text is None
    assert (
        ClientIn.model_validate(_client_payload(photo_guidance_text="")).photo_guidance_text == ""
    )
    assert (
        ClientIn.model_validate(
            _client_payload(photo_guidance_text="Keep health information out of frame.")
        ).photo_guidance_text
        == "Keep health information out of frame."
    )


def test_client_photo_guidance_rejects_more_than_2000_characters():
    with pytest.raises(ValidationError):
        ClientIn.model_validate(_client_payload(photo_guidance_text="x" * 2001))


def test_client_photo_requirement_accepts_only_supported_modes():
    for mode in ("none", "arrival", "departure", "either", "both"):
        assert ClientIn.model_validate(_client_payload(photo_required=mode)).photo_required == mode
    with pytest.raises(ValidationError):
        ClientIn.model_validate(_client_payload(photo_required="always"))
