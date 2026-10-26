"""Routers contain no business logic: parse, call the service, shape the response."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response

from app.core.config import get_settings
from app.core.deps import Principal, get_principal, require_scopes
from app.core.errors import Forbidden, Unauthorised
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import constant_time_equal, hash_ip
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    NativeLoginResponse,
    NativeRefreshRequest,
    ScopeOut,
    TokenResponse,
    UserPublic,
)
from app.modules.auth.scopes import SCOPE_PRESETS, SCOPES

REFRESH_COOKIE = "nhc_refresh"
CSRF_COOKIE = "nhc_csrf"
COOKIE_PATH = "/api/v1/auth"

router = APIRouter(prefix="/auth", tags=["auth"])
admin_router = APIRouter(prefix="/admin", tags=["admin-auth"])


def _user_public(user) -> UserPublic:
    return UserPublic(
        id=str(user.id),
        name=user.name,
        email=user.email,
        scopes=sorted(user.scopes),
        is_superadmin=user.is_superadmin,
    )


def _set_cookies(response: Response, session: service.Session) -> None:
    s = get_settings()
    common = {
        "httponly": True,
        "secure": s.cookie_secure,
        "samesite": s.cookie_samesite,  # type: ignore[arg-type]
        "path": COOKIE_PATH,
        "max_age": s.refresh_token_days * 86400,
    }
    response.set_cookie(REFRESH_COOKIE, session.refresh_token, **common)
    response.set_cookie(CSRF_COOKIE, session.csrf_token, **common)


def _clear_cookies(response: Response) -> None:
    for name in (REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, path=COOKIE_PATH)


def _token_response(session: service.Session) -> TokenResponse:
    return TokenResponse(
        access_token=session.access_token,
        expires_in=session.expires_in,
        csrf_token=session.csrf_token,
        user=_user_public(session.user),
    )


def require_csrf(
    csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    """Double-submit check for the cookie-authenticated calls (refresh, logout)."""
    if not csrf_cookie or not csrf_header or not constant_time_equal(csrf_cookie, csrf_header):
        raise Forbidden("Security check failed. Please sign in again.")


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit("login", 10, 900))],
)
async def login(body: LoginRequest, request: Request, response: Response) -> TokenResponse:
    session = await service.login(
        body.email,
        body.password,
        hash_ip(client_ip(request)),
        request.headers.get("user-agent"),
    )
    _set_cookies(response, session)
    return _token_response(session)


@router.post(
    "/native/login",
    response_model=NativeLoginResponse,
    dependencies=[Depends(rate_limit("auth_native", 10, 60))],
)
async def native_login(
    body: LoginRequest,
    request: Request,
    x_client: Annotated[str | None, Header(alias="X-Client")] = None,
) -> NativeLoginResponse:
    if x_client != "native":
        raise HTTPException(400, detail="Native client header required")
    session = await service.login(
        body.email, body.password, hash_ip(client_ip(request)), request.headers.get("user-agent")
    )
    return NativeLoginResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user=_user_public(session.user),
    )


@router.post(
    "/native/refresh",
    response_model=NativeLoginResponse,
    dependencies=[Depends(rate_limit("auth_native", 10, 60))],
)
async def native_refresh(
    body: NativeRefreshRequest,
    request: Request,
    x_client: Annotated[str | None, Header(alias="X-Client")] = None,
) -> NativeLoginResponse:
    if x_client != "native":
        raise HTTPException(400, detail="Native client header required")
    session = await service.refresh(body.refresh_token, request.headers.get("user-agent"))
    return NativeLoginResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user=_user_public(session.user),
    )


@router.post("/native/logout", status_code=204)
async def native_logout(
    body: NativeRefreshRequest, x_client: Annotated[str | None, Header(alias="X-Client")] = None
) -> None:
    if x_client != "native":
        raise HTTPException(400, detail="Native client header required")
    await service.logout(body.refresh_token)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(require_csrf), Depends(rate_limit("refresh", 60, 900))],
)
async def refresh(
    request: Request,
    response: Response,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> TokenResponse:
    if not refresh_cookie:
        raise Unauthorised()
    try:
        session = await service.refresh(refresh_cookie, request.headers.get("user-agent"))
    except Unauthorised:
        _clear_cookies(response)
        raise
    _set_cookies(response, session)
    return _token_response(session)


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf)])
async def logout(
    response: Response,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> None:
    await service.logout(refresh_cookie)
    _clear_cookies(response)


@router.get("/me", response_model=UserPublic)
async def me(principal: Annotated[Principal, Depends(get_principal)]) -> UserPublic:
    return _user_public(await service.get_active_user(principal.user_id))


@admin_router.get("/scope-presets")
async def list_scope_presets(_: Annotated[Principal, Depends(require_scopes("users:read"))]):
    """Named role presets are transparent data, not an implicit permission hierarchy."""
    return {name: sorted(scopes) for name, scopes in sorted(SCOPE_PRESETS.items())}


@admin_router.get("/scopes", response_model=list[ScopeOut])
async def list_scopes(
    _: Annotated[Principal, Depends(require_scopes("users:read"))],
) -> list[ScopeOut]:
    """The one list of scopes. The frontend loads it from here (12.1.4)."""
    return [ScopeOut(id=s.id, group=s.group, label=s.label) for s in SCOPES]
