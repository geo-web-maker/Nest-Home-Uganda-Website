from app.modules.nurses.staff_numbers import provisional_staff_number


def test_provisional_staff_number_uses_last_six_hex_characters():
    assert provisional_staff_number("507f1f77bcf86cd799439011") == "STF-439011"


def test_provisional_staff_number_extends_by_two_on_collision():
    assert provisional_staff_number(
        "507f1f77bcf86cd799439011", ["STF-439011"]
    ) == "STF-99439011"


def test_provisional_staff_number_is_case_insensitive_for_collisions():
    assert provisional_staff_number(
        "507f1f77bcf86cd799439011", ["stf-439011", "STF-99439011"]
    ) == "STF-D799439011"


def test_provisional_staff_number_rejects_empty_identity():
    try:
        provisional_staff_number("")
    except ValueError as exc:
        assert "user id" in str(exc).lower()
    else:  # pragma: no cover - defensive assertion
        raise AssertionError("empty user IDs must be rejected")
