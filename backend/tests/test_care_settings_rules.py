import pytest

from app.modules.settings.care_keys import CARE_SETTINGS, validate_value
from app.modules.settings.rules import resolve, resolve_sos_enabled


def test_each_setting_has_typed_default():
    for key, spec in CARE_SETTINGS.items():
        validate_value(key, spec.default)


def test_range_validation_and_narrow_override():
    with pytest.raises(ValueError):
        validate_value("geo.default_radius_m", 20)
    assert (
        resolve(
            "geo.default_radius_m",
            {"geo.default_radius_m": 100},
            {"geo.default_radius_m": 120},
            {"geo.default_radius_m": 180},
            {"geo.default_radius_m": 220},
        )
        == 220
    )
    assert (
        resolve("field.max_accuracy_m", {"field.max_accuracy_m": 100}, {"field.max_accuracy_m": 80})
        == 100
    )


def test_sos_fails_closed_for_missing_prerequisites():
    assert (
        resolve_sos_enabled(
            {
                "sos.enabled": True,
                "sos.responder_configured": False,
                "sms.enabled": True,
                "sos.emergency_numbers": ["112"],
            }
        )[0]
        is False
    )
    assert (
        resolve_sos_enabled(
            {
                "sos.enabled": True,
                "sos.responder_configured": True,
                "sms.enabled": True,
                "sos.emergency_numbers": ["112"],
            }
        )[0]
        is True
    )
