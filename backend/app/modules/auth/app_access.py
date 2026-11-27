"""One server-side definition of which principals may use each staff app."""

from collections.abc import Iterable

from app.modules.auth.models import User
from app.modules.nurses.models import NurseProfile

NURSE_APP_SCOPES = frozenset({"field:use", "sos:send"})
UNIVERSAL_SCOPES = frozenset({"mail:use"})


def admin_app_allowed(scopes: Iterable[str], is_superadmin: bool) -> bool:
    """Whether an account has at least one stored non-nurse admin capability."""
    return is_superadmin or bool(set(scopes) - NURSE_APP_SCOPES - UNIVERSAL_SCOPES)


async def nurse_app_state(user: User) -> dict[str, bool | str | None]:
    """Check the nurse app's real stored scope and profile state (no superadmin bypass)."""
    if "field:use" not in user.scopes:
        return {"allowed": False, "reason": "missing_scope"}
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    if profile is None:
        if user.is_test:
            return {"allowed": False, "reason": "missing_profile"}
        return {"allowed": True, "reason": "will_create_profile"}
    if not profile.active:
        return {"allowed": False, "reason": "profile_inactive"}
    return {"allowed": True, "reason": None}
