"""Persistence operations for nurse profiles and devices."""

from app.core.errors import Conflict, Unauthorised
from app.modules.nurses.models import Device, NurseProfile


async def get_profile_for_user(user_id: str) -> NurseProfile | None:
    return await NurseProfile.find_one(NurseProfile.user_id == user_id)


async def get_device(device_id: str) -> Device | None:
    return await Device.find_one(Device.device_id == device_id)


async def register_device(device: Device) -> Device:
    from datetime import UTC, datetime

    if device.push_token and device.push_token_updated_at is None:
        device.push_token_updated_at = datetime.now(UTC)
    existing = await get_device(device.device_id)
    if existing:
        # Device IDs are stable ownership identifiers. Registration must not
        # transfer a device to another account or revive a revoked device.
        if existing.user_id != device.user_id:
            raise Conflict("This device is already registered to another account.")
        if existing.revoked_at is not None:
            raise Unauthorised("This device has been revoked.")
        existing.platform = device.platform
        if device.push_token != existing.push_token:
            existing.push_token = device.push_token
            existing.push_token_updated_at = datetime.now(UTC)
        await existing.save()
        return existing
    await device.insert()
    return device
