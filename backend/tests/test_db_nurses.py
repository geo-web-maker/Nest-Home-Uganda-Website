import pytest
from pymongo.errors import DuplicateKeyError

from app.core import db
from app.core.errors import Conflict, Unauthorised
from app.modules.nurses.models import Device, NurseProfile
from app.modules.nurses.repository import register_device


async def test_nurse_profile_user_id_is_unique(mongo):
    care = db.get_care_database()
    indexes = await care["nurse_profiles"].index_information()
    assert indexes["uq_nurse_profiles_user_id"]["unique"] is True
    await NurseProfile(user_id="nurse-test-0001", staff_number="N-0001").insert()
    with pytest.raises(DuplicateKeyError):
        await NurseProfile(user_id="nurse-test-0001", staff_number="N-0002").insert()


async def test_device_registration_cannot_transfer_ownership(mongo):
    await Device(device_id="stable-device-0001", user_id="nurse-a", platform="android").insert()
    with pytest.raises(Conflict):
        await register_device(
            Device(device_id="stable-device-0001", user_id="nurse-b", platform="android")
        )
    stored = await Device.find_one(Device.device_id == "stable-device-0001")
    assert stored is not None and stored.user_id == "nurse-a"


async def test_revoked_device_cannot_be_revived_by_registration(mongo):
    from datetime import UTC, datetime

    await Device(
        device_id="stable-device-0002",
        user_id="nurse-a",
        platform="android",
        revoked_at=datetime.now(UTC),
    ).insert()
    with pytest.raises(Unauthorised):
        await register_device(
            Device(device_id="stable-device-0002", user_id="nurse-a", platform="android")
        )
    stored = await Device.find_one(Device.device_id == "stable-device-0002")
    assert stored is not None and stored.revoked_at is not None
