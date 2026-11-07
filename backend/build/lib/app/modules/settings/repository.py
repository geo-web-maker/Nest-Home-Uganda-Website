"""Queries and writes for the settings collection."""

from typing import Any

from app.modules.settings.models import SiteSetting


async def get_values() -> dict[str, Any]:
    documents = await SiteSetting.find_all().to_list()
    return {doc.key: doc.value for doc in documents}


async def set_value(key: str, value: Any) -> None:
    group = key.split(".", maxsplit=1)[0]
    current = await SiteSetting.find_one({"key": key})
    if current is None:
        await SiteSetting(key=key, group=group, value=value).insert()
        return
    current.group = group
    current.value = value
    await current.save()


async def seed_defaults(values: dict[str, Any]) -> int:
    created = 0
    for key, value in values.items():
        if key == "sms.provider":
            continue  # provider is deployment configuration, never a persisted setting
        if await SiteSetting.find_one({"key": key}) is None:
            await SiteSetting(key=key, group=key.split(".", maxsplit=1)[0], value=value).insert()
            created += 1
    return created
