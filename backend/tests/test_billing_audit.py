import pytest
from beanie import PydanticObjectId

from app.core.deps import Principal
from app.modules.audit import service as audit
from app.modules.audit.models import AuditLog


@pytest.mark.asyncio
async def test_each_billing_state_change_writes_an_audit_record_without_contact_data(mongo):
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    actions = {
        "invoice.created": "invoice",
        "invoice.updated": "invoice",
        "invoice.deleted": "invoice",
        "invoice.issued": "invoice",
        "invoice.issue_failed": "invoice",
        "invoice.voided": "invoice",
        "invoice.emailed": "invoice",
        "invoice.pdf_downloaded": "invoice",
        "payment.recorded": "payment",
        "payment.rollback": "payment",
        "payment.voided": "payment",
        "payment.emailed": "payment",
        "payment.pdf_downloaded": "payment",
    }
    for action, item_type in actions.items():
        await audit.record(
            principal,
            action,
            item_type,
            str(PydanticObjectId()),
            "BHC-TEST-0001",
            before={"status": "draft", "total_ugx": 410000},
            after={"status": "issued", "amount_ugx": 410000},
        )
    for action, item_type in actions.items():
        record = await AuditLog.find_one(AuditLog.action == action)
        assert record is not None
        assert record.item_type == item_type
        assert not (
            {"email", "phone", "address", "client_name", "payer_reference"}
            & set(record.before or {})
        )
        assert not (
            {"email", "phone", "address", "client_name", "payer_reference"}
            & set(record.after or {})
        )
