import pytest

from app.core.phone import normalise_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("0787 499 988", "+256787499988"), ("+44 20 7946 0958", "+442079460958"), ("+1 (415) 555-0132", "+14155550132")],
)
def test_other_countries_are_accepted(raw: str, expected: str) -> None:
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "N/A", "0044 20 7946 0958", "712345678", "abc"])
def test_numbers_without_a_country_code_are_refused(raw: str) -> None:
    assert normalise_phone(raw) is None
