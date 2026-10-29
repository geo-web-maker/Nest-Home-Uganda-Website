import pytest

from app.modules.settings.care_keys import CARE_SETTINGS, validate_value


def test_photo_requirement_defaults_to_no_requirement():
    assert CARE_SETTINGS["photos.required"].default == "none"


@pytest.mark.parametrize("mode", ["none", "arrival", "departure", "either", "both"])
def test_photo_requirement_accepts_supported_modes(mode):
    assert validate_value("photos.required", mode) == mode


@pytest.mark.parametrize("mode", ["always", "required", "", 2, None])
def test_photo_requirement_rejects_unknown_modes(mode):
    with pytest.raises(ValueError):
        validate_value("photos.required", mode)
