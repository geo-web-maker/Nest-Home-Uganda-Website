"""Profile and Superadmin controls for automatic cross-app SSO."""
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict

from app.core.deps import Principal, get_principal
from app.core.errors import Forbidden, NotFound
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.core.totp_guard import require_totp_session
from app.modules.audit import service as audit
from app.modules.auth.auto_sso import auto_sso_state, set_master_auto_sso_enabled
from app.modules.auth.models import User
from app.modules.auth.repository import user_by_id

router = APIRouter(prefix="/auth/auto-sso", tags=["auth-auto-sso"])
admin_router = APIRouter(prefix="/admin/security/auto-sso", tags=["admin-auto-sso"])


class EnabledBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


async def _superadmin(principal: Principal = Depends(require_totp_session)) -> Principal:
    user = await user_by_id(principal.user_id)
    if user is None or not user.is_active or not user.is_superadmin:
        raise Forbidden("Super administrator access required.")
    return principal


@router.get("")
async def my_auto_sso_settings(principal: Principal = Depends(get_principal)) -> dict[str, bool]:
    user = await user_by_id(principal.user_id)
    if user is None or not user.is_active:
        raise NotFound("User not found.")
    return await auto_sso_state(user)


@router.patch("")
async def update_my_auto_sso_settings(
    body: EnabledBody,
    request: Request,
    principal: Principal = Depends(get_principal),
) -> dict[str, bool]:
    user = await user_by_id(principal.user_id)
    if user is None or not user.is_active:
        raise NotFound("User not found.")
    before = bool(user.auto_sso_enabled)
    user.auto_sso_enabled = body.enabled
    await user.save()
    await audit.record(
        principal,
        "auth.auto_sso.preference.update",
        "user",
        str(user.id),
        user.name,
        before={"auto_sso_enabled": before},
        after={"auto_sso_enabled": body.enabled},
        ip_hash=hash_ip(client_ip(request)),
    )
    return await auto_sso_state(user)


@admin_router.get("")
async def superadmin_auto_sso_settings(
    principal: Annotated[Principal, Depends(_superadmin)],
    page: int = Query(default=1, ge=1, le=10000),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str | None = Query(default=None, max_length=80),
) -> dict:
    master = await master_auto_sso_enabled()
    filters: dict = {}
    if q and q.strip():
        term = re.escape(q.strip())
        filters["$or"] = [
            {"name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ]
    finder = User.find(filters)
    total = await finder.count()
    items = await finder.sort("name", "_id").skip((page - 1) * page_size).limit(page_size).to_list()
    return {
        "master_enabled": master,
        "items": [
            {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "active": user.is_active,
                "is_superadmin": user.is_superadmin,
                "auto_sso_enabled": bool(user.auto_sso_enabled),
                "auto_sso_allowed": bool(user.auto_sso_allowed),
                "effective_enabled": bool(master and user.auto_sso_allowed and user.auto_sso_enabled and user.is_active),
            }
            for user in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@admin_router.patch("/master")
async def update_master_auto_sso(
    body: EnabledBody,
    request: Request,
    principal: Annotated[Principal, Depends(_superadmin)],
) -> dict[str, bool]:
    from app.modules.auth.auto_sso import master_auto_sso_enabled

    before = await master_auto_sso_enabled()
    await set_master_auto_sso_enabled(body.enabled)
    await audit.record(
        principal,
        "auth.auto_sso.master.update",
        "security_setting",
        "automatic_sso",
        "Automatic cross-app sign-in master switch",
        before={"master_enabled": before},
        after={"master_enabled": body.enabled},
        ip_hash=hash_ip(client_ip(request)),
    )
    return {"master_enabled": body.enabled}


@admin_router.patch("/users/{user_id}")
async def update_user_auto_sso(
    user_id: str,
    body: EnabledBody,
    request: Request,
    principal: Annotated[Principal, Depends(_superadmin)],
) -> dict[str, bool | str]:
    user = await user_by_id(user_id)
    if user is None:
        raise NotFound("User not found.")
    before = bool(user.auto_sso_allowed)
    user.auto_sso_allowed = body.enabled
    await user.save()
    await audit.record(
        principal,
        "auth.auto_sso.user_permission.update",
        "user",
        str(user.id),
        user.name,
        before={"auto_sso_allowed": before},
        after={"auto_sso_allowed": body.enabled},
        ip_hash=hash_ip(client_ip(request)),
    )
    state = await auto_sso_state(user)
    return {"user_id": str(user.id), **state}
