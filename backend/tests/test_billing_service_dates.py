import pytest
from pydantic import ValidationError

from app.modules.billing.schemas import ItemIn


def item(text):
    return ItemIn(description="Care", service_date_text=text, quantity=1, unit_price_ugx=1000)


def test_single_date_and_period_are_accepted():
    assert item("2026-11-14").service_date_text == "2026-11-14"
    assert item("2026-11-14 to 2026-11-20").service_date_text == "2026-11-14 to 2026-11-20"
    assert item("").service_date_text == ""


def test_older_free_text_is_still_accepted():
    assert item("Week 1").service_date_text == "Week 1"


@pytest.mark.parametrize("text", ["2026-02-30", "2026-11-20 to 2026-11-14", "2026-13-01 to 2026-13-02"])
def test_impossible_dates_and_backwards_periods_are_rejected(text):
    with pytest.raises(ValidationError):
        item(text)
