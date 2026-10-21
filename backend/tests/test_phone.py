import pytest

from app.core.phone import is_mobile, mask, normalise_e164, to_local


@pytest.mark.parametrize(
    "raw",
    [
        "0787 499 988",
        "0787499988",
        "+256 787 499 988",
        "256787499988",
        "0787-499-988",
        "(0787) 499 988",
    ],
)
def test_mobile_forms_normalise_to_one_value(raw: str) -> None:
    assert normalise_e164(raw) == "+256787499988"


def test_landline_is_valid_but_not_a_mobile() -> None:
    e164 = normalise_e164("0312 345 678")
    assert e164 == "+256312345678"
    assert not is_mobile(e164)


@pytest.mark.parametrize(
    "raw", ["", "123", "0187499988", "+254787499988", "07874999", "abc", "0787 499 9889"]
)
def test_invalid_numbers_are_refused(raw: str) -> None:
    assert normalise_e164(raw) is None


def test_local_format_and_mask() -> None:
    assert to_local("+256787499988") == "0787499988"
    assert mask("0787499988") == "0787***988"
    assert "499" not in mask("0787499988")
