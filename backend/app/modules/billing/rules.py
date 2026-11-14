from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any

from app.core.errors import Conflict, ValidationFailed


def compute_items(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    if not 1 <= len(items) <= 60:
        raise ValidationFailed("An invoice must contain between 1 and 60 items.")
    computed: list[dict[str, Any]] = []
    total = 0
    for item in items:
        quantity, price = item["quantity"], item["unit_price_ugx"]
        if type(quantity) is not int or not 1 <= quantity <= 10000:
            raise ValidationFailed("Quantity must be a positive whole number.")
        if type(price) is not int or not 0 <= price <= 2_000_000_000:
            raise ValidationFailed("Unit price must be a whole UGX amount.")
        amount = quantity * price
        if amount > 2_000_000_000 or total + amount > 2_000_000_000:
            raise ValidationFailed("Invoice total exceeds the allowed UGX limit.")
        computed.append({**item, "amount_ugx": amount})
        total += amount
    if total <= 0:
        raise ValidationFailed("Invoice total must be greater than zero.")
    return computed, total


def validate_due_date(issue_date: date, due_date: date) -> None:
    if due_date < issue_date:
        raise ValidationFailed("Due date must be on or after the issue date.")


def invoice_status_after_payment(paid: int, total: int) -> str:
    if paid <= 0:
        return "issued"
    if paid >= total:
        return "paid"
    return "part_paid"


def can_issue(status: str, item_count: int, total: int) -> bool:
    return status == "draft" and item_count > 0 and total > 0


def can_void_invoice(status: str, valid_payment_count: int) -> bool:
    return status == "issued" and valid_payment_count == 0


def can_void_payment(is_latest_valid: bool) -> bool:
    return is_latest_valid


def canonical_snapshot(snapshot: dict[str, Any]) -> str:
    return json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def snapshot_hash(snapshot: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_snapshot(snapshot).encode("utf-8")).hexdigest()


def verify_code(content_hash: str) -> str:
    return content_hash[:16]


def assert_mutable(status: str) -> None:
    if status != "draft":
        raise Conflict("Issued invoices are immutable. Void the document and create a new invoice.")


def assert_payment_allowed(status: str, balance: int, amount: int) -> None:
    if status not in {"issued", "part_paid"}:
        raise Conflict("Payments can only be recorded against issued invoices.")
    if type(amount) is not int or amount <= 0 or amount > balance:
        raise Conflict(
            "The payment amount must be a whole UGX amount within the outstanding balance."
        )
