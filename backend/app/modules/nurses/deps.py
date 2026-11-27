"""Dependencies for the authenticated account's own nurse profile."""

from app.core.deps import Principal
from app.core.errors import AppError, Unauthorised
from app.modules.auth import repository as auth_repo
from app.modules.nurses.models import NurseProfile
from app.modules.nurses.service import ensure_nurse_profile


async def get_active_nurse_profile(
    principal: Principal, *, inactive_status: int = 404
) -> NurseProfile:
    """Load or safely self-heal the current user's profile.

    Nurse access requires the *stored* field:use scope even for superadmins, whose normal
    principal dependency intentionally bypasses scope checks. Sandbox users and inactive
    accounts are never auto-provisioned. Existing inactive profiles remain inactive.
    """
    user = await auth_repo.user_by_id(principal.user_id)
    if user is None or not user.is_active:
        raise Unauthorised()
    if "field:use" not in user.scopes:
        raise AppError(
            "nurse_scope_missing",
            "Nurse access is not enabled for this account.",
            403,
        )

    profile = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    # Sandbox accounts may have intentionally-created profiles. They are never auto-created
    # or reactivated here, but an already-active profile remains usable inside the sandbox.
    if profile is None and not user.is_test:
        profile, _created = await ensure_nurse_profile(user, source="lazy")
    if profile is None:
        raise AppError("nurse_profile_missing", "Nurse profile not found", 404)
    if not profile.active:
        raise AppError("nurse_profile_inactive", "Your nurse profile is switched off.", inactive_status)
    return profile
