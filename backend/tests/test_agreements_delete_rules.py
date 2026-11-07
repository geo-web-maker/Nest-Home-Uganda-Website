"""Which agreements may be deleted, and what the operator is told when they may not."""
import pytest

from app.modules.agreements import rules


@pytest.mark.parametrize("status", ["draft", "changes_requested", "expired", "voided"])
def test_unsent_or_closed_agreements_can_be_deleted(status: str) -> None:
    assert rules.deletion_block_reason(status) is None


@pytest.mark.parametrize("status", ["sent", "client_in_progress"])
def test_agreements_with_the_client_must_be_voided_first(status: str) -> None:
    assert "Void it first" in (rules.deletion_block_reason(status) or "")


def test_client_signed_agreements_must_be_voided_first() -> None:
    assert "Void it first" in (rules.deletion_block_reason("client_signed") or "")


def test_completed_agreements_are_never_deletable() -> None:
    assert "amendment" in (rules.deletion_block_reason("completed") or "")


def test_unknown_status_is_refused() -> None:
    assert rules.deletion_block_reason("mystery") is not None


def test_every_status_has_an_explicit_decision() -> None:
    from typing import get_args
    from app.modules.agreements.models import AgreementStatus
    for status in get_args(AgreementStatus):
        reason = rules.deletion_block_reason(status)
        assert (reason is None) == (status in rules.DELETABLE_STATUSES)
