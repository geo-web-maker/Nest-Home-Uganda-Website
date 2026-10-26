import base64

import pytest

from app.modules.settings.care_env import env_name, env_value, validate_care_environment
from app.modules.settings.care_keys import CARE_SETTINGS


def test_names_follow_the_documented_rule_and_do_not_collide():
    assert env_name("thresholds.clock_skew_min") == "CARE_THRESHOLDS_CLOCK_SKEW_MIN"
    assert env_name("care.module_c_enabled") == "CARE_MODULE_C_ENABLED"
    names = [env_name(key) for key in CARE_SETTINGS]
    assert len(names) == len(set(names))


def test_environment_values_are_strictly_parsed():
    assert env_value("care.module_c_enabled", {"CARE_MODULE_C_ENABLED": "true"}) is True
    assert env_value("geo.default_radius_m", {"CARE_GEO_DEFAULT_RADIUS_M": "250"}) == 250
    assert env_value(
        "sos.emergency_numbers", {"CARE_SOS_EMERGENCY_NUMBERS": "Police=999,Ambulance=112"}
    ) == ["Police=999", "Ambulance=112"]
    with pytest.raises(ValueError, match="CARE_MODULE_C_ENABLED"):
        env_value("care.module_c_enabled", {"CARE_MODULE_C_ENABLED": "yes"})


def test_text_b64_fallback_and_plain_text_precedence():
    encoded = base64.b64encode(b"Owner notice").decode()
    assert (
        env_value("privacy.notice_text", {"CARE_PRIVACY_NOTICE_TEXT_B64": encoded})
        == "Owner notice"
    )
    assert (
        env_value(
            "privacy.notice_text",
            {"CARE_PRIVACY_NOTICE_TEXT": "Plain", "CARE_PRIVACY_NOTICE_TEXT_B64": encoded},
        )
        == "Plain"
    )


def test_environment_validation_checks_every_supplied_value():
    validate_care_environment({})
