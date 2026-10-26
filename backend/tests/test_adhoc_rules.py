from types import SimpleNamespace

from app.modules.field.adhoc_rules import active_stay_for_date, is_adhoc_allowed


def test_adhoc_override_has_priority_over_organisation_setting():
    for override in (None, False, True):
        for enabled in (False, True):
            expected = enabled if override is None else override
            assert is_adhoc_allowed(override, enabled) is expected


def test_active_stay_uses_inclusive_start_and_end_dates_and_latest_start():
    stays = [
        SimpleNamespace(id="old", starts_on="2026-01-01", ends_on="2026-10-25"),
        SimpleNamespace(id="current", starts_on="2026-10-25", ends_on=None),
        SimpleNamespace(id="future", starts_on="2026-10-26", ends_on=None),
    ]
    assert active_stay_for_date(stays, "2026-10-25").id == "current"
    assert active_stay_for_date(stays, "2026-10-24") is None
    assert active_stay_for_date(stays, "2026-10-26").id == "future"


def test_explicit_false_override_blocks_an_enabled_organisation():
    assert is_adhoc_allowed(False, True) is False


def test_explicit_true_override_allows_when_organisation_default_is_off():
    assert is_adhoc_allowed(True, False) is True
