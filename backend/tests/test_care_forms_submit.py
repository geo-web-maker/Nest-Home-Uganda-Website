"""Written, not run: one-shot submit (offline outbox) and bootstrap."""
import pytest

from app.core.errors import ValidationFailed
from app.modules.care_clients.models import CareClient
from app.modules.care_forms import service
from app.modules.care_forms.models import CareFormInstance


async def test_submit_is_idempotent_per_op_id(mongo):
    await CareClient(id="client-sub-1", display_name="S", assigned_nurse_ids=["nurse-sub-1"]).insert()
    a, _ = await service.submit("nurse-sub-1", op_id="op-00000001", form_id="09", client_id="client-sub-1", visit_id=None, data={"x": "1"}, client_sig=None, nurse_sig=None)
    b, copy = await service.submit("nurse-sub-1", op_id="op-00000001", form_id="09", client_id="client-sub-1", visit_id=None, data={"x": "2"}, client_sig=None, nurse_sig=None)
    assert str(a.id) == str(b.id) and copy == "skipped"
    assert await CareFormInstance.find(CareFormInstance.client_id == "client-sub-1").count() == 1


async def test_submit_rejects_unassigned_nurse(mongo):
    await CareClient(id="client-sub-2", display_name="S", assigned_nurse_ids=["someone-else"]).insert()
    with pytest.raises(Exception):
        await service.submit("nurse-sub-1", op_id="op-00000002", form_id="09", client_id="client-sub-2", visit_id=None, data={}, client_sig=None, nurse_sig=None)


async def test_tracker_submit_blocked_for_general(mongo):
    await CareClient(id="client-sub-3", display_name="G", assigned_nurse_ids=["nurse-sub-1"]).insert()
    with pytest.raises(ValidationFailed):
        await service.submit("nurse-sub-1", op_id="op-00000003", form_id="tracker", client_id="client-sub-3", visit_id=None, data={"week_start": "2026-11-16"}, client_sig=None, nurse_sig=None)


async def test_bootstrap_lists_only_my_clients_and_hides_signed_data(mongo):
    await CareClient(id="client-sub-4", display_name="Mine", assigned_nurse_ids=["nurse-sub-9"], patient_type="Baby").insert()
    await CareClient(id="client-sub-5", display_name="Other", assigned_nurse_ids=["x"]).insert()
    out = await service.bootstrap("nurse-sub-9")
    assert [c["id"] for c in out["clients"]] == ["client-sub-4"] and out["clients"][0]["patient_type"] == "Baby"
    assert out["gates_enabled"] is False and out["auto_email_copy"] is False
