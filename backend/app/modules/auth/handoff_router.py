"""Authenticated capability discovery and single-use cross-app session handoff."""

import base64
import hashlib
import re
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import get_settings
from app.core.deps import Principal, get_principal
from app.core.errors import AppError, Unauthorised
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import constant_time_equal, hash_ip, hash_token, new_opaque_token
from app.modules.audit import service as audit
from app.modules.auth import service as auth_service
from app.modules.auth.app_access import admin_app_allowed, nurse_app_state
from app.modules.auth.auto_sso import auto_sso_state
from app.modules.auth.models import AppHandoff, User
from app.modules.app_releases.models import AppRelease
from app.modules.auth.router import _set_cookies, _token_response, _user_public
from app.modules.auth.schemas import NativeLoginResponse, TokenResponse
from app.modules.nurses.models import NurseProfile
from app.modules.nurses.service import ensure_nurse_profile

router = APIRouter(prefix="/auth", tags=["auth-app-switch"])
AppName = Literal["admin", "nurse"]
_CODE_RE = re.compile(r"^[A-Za-z0-9_-]{20,100}$")
_CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
_VERIFIER_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")


class HandoffIssueBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_app: AppName
    target_app: AppName
    challenge: str | None = Field(default=None, min_length=43, max_length=43)
    mode: Literal["manual", "automatic"] = "manual"


class HandoffCheckBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=20, max_length=100)
    app: AppName


class HandoffRedeemBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=20, max_length=100)
    app: AppName
    verifier: str | None = Field(default=None, min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$")


def _settings_url(app: AppName) -> str | None:
    settings = get_settings()
    value = settings.admin_url if app == "admin" else settings.nurse_frontend_url
    return value.strip().rstrip("/") or None


async def _app_access(user: User) -> dict:
    settings = get_settings()
    admin_allowed = admin_app_allowed(user.scopes, user.is_superadmin)
    nurse = await nurse_app_state(user)
    releases = await AppRelease.find().to_list()
    apk_by_app = {
        app: any(row.app == app and row.platform == "android" and row.active and bool(row.apk_key) for row in releases)
        for app in ("admin", "nurse")
    }
    suggestions_allowed = True
    if user.is_test:
        from app.core import sandbox
        suggestions_allowed = await sandbox.master_enabled()
    return {
        "suggestions_allowed": suggestions_allowed,
        "admin": {
            "allowed": admin_allowed,
            "url": _settings_url("admin"),
            "android_package": settings.android_package_admin,
            "apk_available": apk_by_app["admin"],
        },
        "nurse": {
            **nurse,
            "url": _settings_url("nurse"),
            "android_package": settings.android_package_nurse,
            "apk_available": apk_by_app["nurse"],
        },
        "handoff_enabled": settings.handoff_enabled,
        "automatic_sso": await auto_sso_state(user),
    }


def _challenge_for(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _generic_redeem_failure() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="This sign-in link has expired. Sign in with your password.",
    )


@router.get("/app-access", dependencies=[Depends(rate_limit("app_access", 60, 60))])
async def get_app_access(principal: Principal = Depends(get_principal)) -> dict:
    user = await auth_service.get_active_user(principal.user_id)
    return await _app_access(user)


@router.post(
    "/handoff",
    dependencies=[Depends(rate_limit("handoff_issue", 10, 60))],
)
async def issue_handoff(
    body: HandoffIssueBody,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
) -> dict:
    settings = get_settings()
    if not settings.handoff_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    if body.source_app == body.target_app:
        raise HTTPException(status_code=422, detail="Choose the other application.")
    if body.challenge is not None and not _CHALLENGE_RE.fullmatch(body.challenge):
        raise HTTPException(status_code=422, detail="Invalid sign-in challenge.")

    user = await auth_service.get_active_user(principal.user_id)
    if body.mode == "automatic":
        # Automatic mode is a deliberate opt-in policy, never inferred from app installation.
        # Existing app-switch buttons and PKCE relays default to manual and remain available.
        sso = await auto_sso_state(user)
        if not sso["effective_enabled"]:
            raise AppError("automatic_sso_disabled", "Automatic sign-in is disabled for this account.", 403)
    now = datetime.now(UTC)
    if user.locked_until and user.locked_until > now:
        raise Unauthorised("This account is temporarily locked. Try again later.")
    if user.temp_password_expires_at is not None:
        raise Unauthorised("Finish setting your password before switching apps.")
    if user.is_test:
        from app.core import sandbox
        if not await sandbox.master_enabled():
            raise Unauthorised()

    access = await _app_access(user)
    target = access[body.target_app]
    if not target["allowed"]:
        raise AppError("no_access_to_target", "This account cannot use that app.", 403)

    code = new_opaque_token()
    await AppHandoff(
        code_hash=hash_token(code),
        user_id=user.id,
        source_app=body.source_app,
        target_app=body.target_app,
        challenge=body.challenge,
        mode=body.mode,
        expires_at=now + timedelta(seconds=settings.handoff_code_seconds),
        ip_hash=hash_ip(client_ip(request)),
        user_agent=(request.headers.get("user-agent") or "")[:200] or None,
    ).insert()
    await audit.record(
        principal,
        "auth.handoff.issue",
        "app_handoff",
        None,
        user.name,
        after={"source_app": body.source_app, "target_app": body.target_app},
        ip_hash=hash_ip(client_ip(request)),
    )
    response.headers["Cache-Control"] = "no-store"
    return {"code": code, "expires_in": settings.handoff_code_seconds}


@router.post(
    "/handoff/check",
    dependencies=[Depends(rate_limit("handoff_check", 20, 60))],
)
async def check_handoff(
    body: HandoffCheckBody,
    principal: Principal = Depends(get_principal),
) -> dict:
    """Check whether a pending handoff belongs to the current account without consuming it.

    Used by the nurse app to preserve queued offline records when the handoff changes identity.
    The response intentionally reveals only whether both identities match.
    """
    if not get_settings().handoff_enabled or not _CODE_RE.fullmatch(body.code):
        raise _generic_redeem_failure()
    now = datetime.now(UTC)
    handoff = await AppHandoff.find_one(
        AppHandoff.code_hash == hash_token(body.code),
        AppHandoff.used_at == None,  # noqa: E711
        AppHandoff.expires_at > now,
        AppHandoff.target_app == body.app,
    )
    if handoff is None:
        raise _generic_redeem_failure()
    # Both identities must still be active and the handoff target must remain authorised.
    await auth_service.get_active_user(principal.user_id)
    source_user = await auth_service.get_active_user(str(handoff.user_id))
    if handoff.mode == "automatic":
        sso = await auto_sso_state(source_user)
        if not sso["effective_enabled"]:
            raise _generic_redeem_failure()
    access = await _app_access(source_user)
    if not access[body.app]["allowed"]:
        raise _generic_redeem_failure()
    return {"same_user": str(handoff.user_id) == principal.user_id}


@router.post(
    "/handoff/redeem",
    dependencies=[Depends(rate_limit("handoff_redeem", 10, 60))],
    response_model=TokenResponse | NativeLoginResponse,
)
async def redeem_handoff(
    body: HandoffRedeemBody,
    request: Request,
    response: Response,
    x_client: str | None = Header(default=None, alias="X-Client"),
) -> TokenResponse | NativeLoginResponse:
    settings = get_settings()
    response.headers["Cache-Control"] = "no-store"
    if not settings.handoff_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    if not _CODE_RE.fullmatch(body.code):
        raise _generic_redeem_failure()

    now = datetime.now(UTC)
    token_hash = hash_token(body.code)
    claimed = await AppHandoff.get_pymongo_collection().find_one_and_update(
        {"code_hash": token_hash, "used_at": None, "expires_at": {"$gt": now}},
        {"$set": {"used_at": now}},
        return_document=True,
    )
    if claimed is None:
        existing = await AppHandoff.find_one(AppHandoff.code_hash == token_hash)
        reason = "reused" if existing and existing.used_at else "unknown_or_expired"
        await audit.record(
            None,
            "auth.handoff.reject",
            "app_handoff",
            None,
            None,
            after={"reason": reason, "target_app": body.app},
            ip_hash=hash_ip(client_ip(request)),
        )
        raise _generic_redeem_failure()

    handoff = AppHandoff.model_validate(claimed)
    failure_reason = None
    if handoff.target_app != body.app:
        failure_reason = "wrong_target"
    elif handoff.challenge is not None:
        if not body.verifier or not _VERIFIER_RE.fullmatch(body.verifier) or not constant_time_equal(_challenge_for(body.verifier), handoff.challenge):
            failure_reason = "challenge_mismatch"
    if failure_reason:
        await audit.record(
            None,
            "auth.handoff.reject",
            "app_handoff",
            str(handoff.id),
            None,
            after={"reason": failure_reason, "target_app": body.app},
            ip_hash=hash_ip(client_ip(request)),
        )
        raise _generic_redeem_failure()

    try:
        user = await auth_service.get_active_user(str(handoff.user_id))
    except Unauthorised:
        await audit.record(
            None,
            "auth.handoff.reject",
            "app_handoff",
            str(handoff.id),
            None,
            after={"reason": "account_unavailable", "target_app": body.app},
            ip_hash=hash_ip(client_ip(request)),
        )
        raise _generic_redeem_failure()
    if handoff.mode == "automatic":
        sso = await auto_sso_state(user)
        if not sso["effective_enabled"]:
            await audit.record(None, "auth.handoff.reject", "app_handoff", str(handoff.id), None, after={"reason": "automatic_sso_disabled", "target_app": body.app}, ip_hash=hash_ip(client_ip(request)))
            raise _generic_redeem_failure()
    if (user.locked_until and user.locked_until > now) or user.temp_password_expires_at is not None:
        await audit.record(None, "auth.handoff.reject", "app_handoff", str(handoff.id), None, after={"reason": "account_unavailable"}, ip_hash=hash_ip(client_ip(request)))
        raise _generic_redeem_failure()
    if user.is_test:
        from app.core import sandbox
        if not await sandbox.master_enabled():
            await audit.record(None, "auth.handoff.reject", "app_handoff", str(handoff.id), None, after={"reason": "sandbox_disabled"}, ip_hash=hash_ip(client_ip(request)))
            raise _generic_redeem_failure()

    access = await _app_access(user)
    if not access[body.app]["allowed"]:
        await audit.record(None, "auth.handoff.reject", "app_handoff", str(handoff.id), None, after={"reason": "capability_changed", "target_app": body.app}, ip_hash=hash_ip(client_ip(request)))
        raise _generic_redeem_failure()
    if body.app == "nurse":
        # Existing sandbox profiles are intentionally not auto-created or reactivated, but
        # an already-active sandbox profile may still be used while sandbox mode is enabled.
        profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
        if profile is None and not user.is_test:
            profile, _ = await ensure_nurse_profile(
                user,
                actor=auth_service._principal(user),
                source="handoff",
                reactivate=False,
                ip_hash=hash_ip(client_ip(request)),
            )
        if profile is None or not profile.active:
            raise _generic_redeem_failure()

    user.last_login_at = now
    user.failed_logins = 0
    user.last_failed_at = None
    user.locked_until = None
    await user.save()
    session = await auth_service._issue_session(user, request.headers.get("user-agent"), now)
    await audit.record(
        auth_service._principal(user),
        "auth.handoff.redeem",
        "app_handoff",
        str(handoff.id),
        user.name,
        after={"source_app": handoff.source_app, "target_app": handoff.target_app, "client": "native" if x_client == "native" else "web"},
        ip_hash=hash_ip(client_ip(request)),
    )
    if x_client == "native":
        return NativeLoginResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in,
            user=_user_public(user),
        )
    _set_cookies(response, session)
    return _token_response(session)
