import pytest

from app.core.errors import AppError
from app.modules.care_clients.models import CareClient
from app.modules.care_forms import service
from app.modules.nurses.models import NurseProfile


async def test_patient_type_defaults_to_general_and_rejects_unknown(mongo):
    c = CareClient(id="client-test-0001", display_name="Mary K")
    await c.insert()
    assert (await CareClient.find_one(CareClient.id == "client-test-0001")).patient_type == "General"
    with pytest.raises(ValueError):
        CareClient(id="client-test-0002", display_name="X", patient_type="Twin")


async def test_unmc_fields_are_optional_on_new_nurse(mongo):
    p = NurseProfile(user_id="nurse-test-0100", staff_number="N-100")
    await p.insert()
    stored = await NurseProfile.find_one(NurseProfile.user_id == "nurse-test-0100")
    assert stored.unmc_number is None and stored.unmc_verified_by is None


async def test_verifier_cannot_be_the_owner(mongo):
    from app.core.deps import Principal
    from app.modules.care_forms.router import verify_unmc

    await NurseProfile(user_id="nurse-test-0101", staff_number="N-101", unmc_number="A-1").insert()
    me = Principal(user_id="nurse-test-0101", scopes=frozenset({"nurses:write"}), is_superadmin=False)
    with pytest.raises(AppError) as e:
        await verify_unmc("nurse-test-0101", me)
    assert e.value.code == "self_verification"


async def test_trackers_blocked_for_general_patients(mongo):
    await CareClient(id="client-test-0003", display_name="G", assigned_nurse_ids=["nurse-test-0102"]).insert()
    with pytest.raises(Exception) as e:
        await service.save_draft("nurse-test-0102", "tracker", "client-test-0003", None, {"week_start": "2026-11-16"})
    assert "Mama or Baby" in str(e.value)


async def test_gates_off_by_default(mongo):
    assert await service.arrive_blocked("client-test-0003") is False
