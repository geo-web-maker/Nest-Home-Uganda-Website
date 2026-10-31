"""Phase 1 mail settings and health service."""

from typing import Any

from app.modules.mail import db
from app.modules.mail import settings_service


async def settings_list() -> dict[str, Any]:
    items = await settings_service.settings_for_api()
    enabled = await settings_service.get_value("mail.enabled")
    return {"items": items, "feature_enabled": bool(enabled)}


async def update_settings(values: dict[str, Any], actor_user_id: str) -> dict[str, Any]:
    await settings_service.set_values(values, actor_user_id)
    return await settings_list()


async def reset_setting(key: str, actor_user_id: str) -> dict[str, Any]:
    await settings_service.reset_value(key, actor_user_id)
    return await settings_list()


async def health() -> bool:
    try:
        return await db.ping()
    except Exception:
        return False
