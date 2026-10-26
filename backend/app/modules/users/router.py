"""Reads need users:read, every change needs users:write. set-password is public (one-time link)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import Principal, require_scopes
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import hash_ip
from app.modules.users import service
from app.modules.users.schemas import AdminUserOut, Done, SetPasswordIn, UserInvite, UserUpdate

public_router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin/users", tags=["admin-users"])

CanRead = Annotated[Principal, Depends(require_scopes("users:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("users:write"))]


@public_router.post(
    "/set-password",
    response_model=Done,
    dependencies=[Depends(rate_limit("set_password", 10, 900))],
)
async def set_password(body: SetPasswordIn, request: Request) -> Done:
    return await service.set_password(body.token, body.password, hash_ip(client_ip(request)))


@public_router.post(
    "/accept-invite",
    response_model=Done,
    dependencies=[Depends(rate_limit("accept_invite", 10, 900))],
)
async def accept_invite(body: SetPasswordIn, request: Request) -> Done:
    return await service.set_password(
        body.token, body.password, hash_ip(client_ip(request)), expected_purpose="invite"
    )


@admin_router.get("", response_model=Page[AdminUserOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> Page[AdminUserOut]:
    return await service.list_users(page, q)


@admin_router.post("", response_model=AdminUserOut, status_code=201)
async def admin_invite(body: UserInvite, principal: CanWrite, request: Request) -> AdminUserOut:
    return await service.invite(principal, body, hash_ip(client_ip(request)))


@admin_router.patch("/{user_id}", response_model=AdminUserOut)
async def admin_update(
    user_id: str, body: UserUpdate, principal: CanWrite, request: Request
) -> AdminUserOut:
    return await service.update(principal, user_id, body, hash_ip(client_ip(request)))


@admin_router.post("/{user_id}/reset-password", response_model=Done)
async def admin_reset_password(user_id: str, principal: CanWrite, request: Request) -> Done:
    return await service.reset_password(principal, user_id, hash_ip(client_ip(request)))


@admin_router.post("/{user_id}/sign-out", response_model=Done)
async def admin_sign_out(user_id: str, principal: CanWrite, request: Request) -> Done:
    return await service.sign_out(principal, user_id, hash_ip(client_ip(request)))
