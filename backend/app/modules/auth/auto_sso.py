"""Automatic cross-app SSO preferences and their Superadmin-controlled master switch."""
from app.modules.auth.models import User
from app.modules.settings.models import SiteSetting

MASTER_KEY = "security.AUTO_SSO_MASTER_ENABLED"


async def master_auto_sso_enabled() -> bool:
    setting = await SiteSetting.find_one(SiteSetting.key == MASTER_KEY)
    return setting.value is True if setting is not None else False


async def auto_sso_state(user: User) -> dict[str, bool]:
    master = await master_auto_sso_enabled()
    personal = bool(user.auto_sso_enabled)
    allowed = bool(user.auto_sso_allowed)
    return {
        "master_enabled": master,
        "user_enabled": personal,
        "admin_allowed": allowed,
        "effective_enabled": bool(master and allowed and personal and user.is_active),
    }


async def set_master_auto_sso_enabled(enabled: bool) -> bool:
    setting = await SiteSetting.find_one(SiteSetting.key == MASTER_KEY)
    if setting is None:
        await SiteSetting(key=MASTER_KEY, group="security", value=enabled).insert()
    else:
        setting.group = "security"
        setting.value = enabled
        await setting.save()
    return enabled
