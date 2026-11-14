"""Pure settings rules: default values, language fallback and contrast validation."""

import pytest

from app.core.config import Settings
from app.core.errors import ValidationFailed
from app.modules.settings.defaults import setting_defaults
from app.modules.settings.service import _check_theme, _localise, contrast_ratio


def test_settings_defaults_match_the_public_build_spec() -> None:
    values = setting_defaults(Settings(business_email="info@example.test"))
    assert values["business.phone_display"] == "0787 499 988"
    assert values["business.phone_dial"] == "+256787499988"
    assert values["business.whatsapp"] == "256787499988"
    assert values["business.address"] == "Kampala, Uganda"
    assert values["business.email"] == "info@example.test"
    assert values["business.hours"] == "Add opening hours"
    assert values["seo.index"] is False
    assert values["forms.consent_text"] == (
        "I agree that Bloomwell Home Care may contact me about this request."
    )
    assert values["home.arches"] == [
        {"title": "Elders", "caption": "with dignity"},
        {"title": "Newborns", "caption": "and mothers"},
        {"title": "Recovery", "caption": "after surgery"},
    ]
    assert len(values["home.promise"]) == 3


def test_public_localisation_uses_requested_language_then_english() -> None:
    assert _localise({"en": "Hello", "lg": "Gyebale"}, "lg") == "Gyebale"
    assert _localise({"en": "Hello"}, "sw") == "Hello"
    assert _localise({"title": "Hello", "caption": "World"}, "lg") == {
        "title": "Hello",
        "caption": "World",
    }


def test_brand_theme_meets_minimum_contrast() -> None:
    _check_theme({"theme.forest": "#0B2E2A", "theme.gold": "#F8991E"})
    assert contrast_ratio("#F2F8F6", "#0B2E2A") >= 4.5
    assert contrast_ratio("#1B1706", "#F8991E") >= 4.5


def test_theme_rejects_colours_that_fail_contrast() -> None:
    with pytest.raises(ValidationFailed):
        _check_theme({"theme.forest": "#FFFFFF", "theme.gold": "#F8991E"})
    with pytest.raises(ValidationFailed):
        _check_theme({"theme.forest": "#0B2E2A", "theme.gold": "#3A3000"})
