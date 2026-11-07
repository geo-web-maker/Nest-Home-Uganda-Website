from datetime import UTC, datetime

from app.modules.audit.models import AuditLog
from app.modules.care_ops.models import CareSetting
from app.modules.settings.care_env import defaults_with_environment
from app.modules.settings.care_keys import CARE_SETTINGS, validate_value


async def care_values():
    stored = {
        row.key: row.value for row in await CareSetting.find().to_list() if row.key in CARE_SETTINGS
    }
    layered = defaults_with_environment()
    return {key: stored.get(key, layered[key]) for key in CARE_SETTINGS}


async def save_care_value(key, value, user_id):
    if key not in CARE_SETTINGS:
        raise KeyError(key)
    validate_value(key, value)
    existing = await CareSetting.find_one(CareSetting.key == key)
    before = existing.value if existing else CARE_SETTINGS[key].default
    if existing:
        existing.value = value
        existing.updated_by = user_id
        existing.updated_at = datetime.now(UTC)
        await existing.save()
    else:
        await CareSetting(
            key=key, value=value, group=CARE_SETTINGS[key].group, updated_by=user_id
        ).insert()
    await AuditLog(
        action="care.setting.update",
        item_type="care_setting",
        item_id=key,
        before={"value": before},
        after={"value": value},
    ).insert()
    return {"id": key, "value": value}


async def care_setting_sources():
    stored = {row.key for row in await CareSetting.find().to_list()}
    from app.modules.settings.care_env import env_value

    return {
        key: (
            "Set here"
            if key in stored
            else "From environment"
            if env_value(key) is not None
            else "Built-in default"
        )
        for key in CARE_SETTINGS
    }


async def reset_care_value(key, user_id):
    if key not in CARE_SETTINGS:
        raise KeyError(key)
    existing = await CareSetting.find_one(CareSetting.key == key)
    before = existing.value if existing else CARE_SETTINGS[key].default
    if existing:
        await existing.delete()
    from app.modules.settings.care_env import env_value

    fallback = env_value(key)
    after = fallback if fallback is not None else CARE_SETTINGS[key].default
    await AuditLog(
        action="care.setting.reset",
        item_type="care_setting",
        item_id=key,
        before={"value": before},
        after={"value": after},
    ).insert()
    return {
        "id": key,
        "value": after,
        "source": "From environment" if fallback is not None else "Built-in default",
    }
