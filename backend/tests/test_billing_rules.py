from datetime import date

import pytest

from app.core.errors import Conflict, ValidationFailed
from app.modules.billing import rules


def test_compute_items_uses_integer_ugx_and_server_amounts():
    items, total = rules.compute_items(
        [
            {"description": "Care", "quantity": 2, "unit_price_ugx": 100000},
            {"description": "Transport", "quantity": 1, "unit_price_ugx": 210000},
        ]
    )
    assert [item["amount_ugx"] for item in items] == [200000, 210000]
    assert total == 410000


@pytest.mark.parametrize("quantity,price", [(0, 1), (1.5, 1), (1, 2.5), (True, 1), (1, -1)])
def test_compute_items_rejects_non_integer_or_invalid_money(quantity, price):
    with pytest.raises(ValidationFailed):
        rules.compute_items(
            [{"description": "Test", "quantity": quantity, "unit_price_ugx": price}]
        )


def test_compute_items_rejects_empty_and_overflow():
    with pytest.raises(ValidationFailed):
        rules.compute_items([])
    with pytest.raises(ValidationFailed):
        rules.compute_items(
            [{"description": "Large", "quantity": 10000, "unit_price_ugx": 2000000}]
        )


def test_due_date_must_not_precede_issue_date():
    with pytest.raises(ValidationFailed):
        rules.validate_due_date(date(2026, 11, 14), date(2026, 11, 13))


@pytest.mark.parametrize(
    ("paid", "total", "expected"),
    [
        (0, 410000, "issued"),
        (200000, 410000, "part_paid"),
        (410000, 410000, "paid"),
        (0, 410000, "issued"),
    ],
)
def test_payment_status_rules(paid, total, expected):
    assert rules.invoice_status_after_payment(paid, total) == expected


def test_issue_and_void_rules():
    assert rules.can_issue("draft", 1, 1)
    assert not rules.can_issue("issued", 1, 1)
    assert rules.can_void_invoice("issued", 0)
    assert not rules.can_void_invoice("issued", 1)
    assert not rules.can_void_invoice("part_paid", 0)
    assert rules.can_void_payment(True)
    assert not rules.can_void_payment(False)


def test_issued_invoice_is_immutable():
    with pytest.raises(Conflict):
        rules.assert_mutable("issued")


def test_payment_amount_must_be_positive_integer_within_balance():
    rules.assert_payment_allowed("issued", 100, 100)
    rules.assert_payment_allowed("part_paid", 100, 1)
    for status, balance, amount in [
        ("draft", 100, 1),
        ("void", 100, 1),
        ("paid", 0, 1),
        ("issued", 100, 101),
        ("issued", 100, 0),
        ("issued", 100, 1.5),
    ]:
        with pytest.raises(Conflict):
            rules.assert_payment_allowed(status, balance, amount)


def test_void_is_terminal_and_draft_cannot_be_voided():
    assert not rules.can_void_invoice("draft", 0)
    assert not rules.can_void_invoice("void", 0)
    assert not rules.can_void_invoice("part_paid", 0)
    assert not rules.can_void_invoice("paid", 0)


def test_billing_text_sanitisation_strips_control_and_bidi_characters():
    from app.modules.billing.schemas import BillToIn, ItemIn, VoidIn

    bill_to = BillToIn(name="  Mrs\u202e A\nNakato  ", address="Bombo\x00 Road")
    item = ItemIn(description="  Care\u2066 visit  ", quantity=1, unit_price_ugx=1000)
    reason = VoidIn(reason="  Wrong\x00 amount  ")
    assert bill_to.name == "Mrs A Nakato"
    assert bill_to.address == "Bombo Road"
    assert item.description == "Care visit"
    assert reason.reason == "Wrong amount"
