import pytest

from app.modules.app_releases.rules import (
    WEB_COUNTER_MAX,
    apk_generation,
    check_build_version,
    next_apk_version,
    next_web_version,
    plan_versions,
)


def test_nothing_released_yet_means_the_first_apk_is_1_and_web_starts_at_0_1():
    assert next_apk_version([]) == "1.0.0"
    assert next_web_version([], []) == "0.0.1"
    assert apk_generation([]) == 0


def test_web_counter_steps_by_one_per_update_after_an_apk():
    assert next_web_version(["1.0.0"], []) == "1.0.1"
    assert next_web_version(["1.0.0"], ["1.0.1", "1.0.2"]) == "1.0.3"


def test_web_counter_rolls_over_the_second_number_at_99():
    assert next_web_version(["1.0.0"], ["1.0.99"]) == "1.1.0"
    assert next_web_version(["1.0.0"], ["1.0.99", "1.1.0", "1.0.5"]) == "1.1.1"


def test_web_counter_is_full_at_99_99():
    with pytest.raises(ValueError, match="full"):
        next_web_version(["1.0.0"], [f"1.{WEB_COUNTER_MAX}.{WEB_COUNTER_MAX}"])


def test_a_new_apk_resets_the_web_counter_to_0_0():
    apks = ["1.0.0", "2.0.0"]
    web = ["1.0.1", "1.5.7"]
    assert next_apk_version(apks) == "3.0.0"
    assert next_web_version(apks, web) == "2.0.1"
    assert next_web_version(apks, web + ["2.0.1"]) == "2.0.2"


def test_a_failed_apk_does_not_use_its_number_up():
    # 1.0.0 was attempted but never published, so no release record exists for it.
    assert next_apk_version([]) == "1.0.0"
    assert next_apk_version(["1.0.0"]) == "2.0.0"


def test_plan_shows_current_and_next():
    plan = plan_versions(["1.0.0", "2.0.0"], ["1.0.4", "2.0.1", "2.0.2"])
    assert plan == {
        "current_apk": "2.0.0",
        "current_web": "2.0.2",
        "next_apk": "3.0.0",
        "next_web": "2.0.3",
    }
    assert plan_versions([], [])["current_web"] is None


def test_check_build_version_only_accepts_the_assigned_number():
    check_build_version("web", "1.0.3", "1.0.3")
    with pytest.raises(ValueError, match="1.0.3"):
        check_build_version("web", "1.0.3", "1.0.9")
    with pytest.raises(ValueError):
        check_build_version("other", "1.0.3", "1.0.3")
