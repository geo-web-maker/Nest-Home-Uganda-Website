"""Authentication and scope enforcement as FastAPI dependencies.

The server is the authority (12.1.6). Access tokens carry the scopes, so a request
needs no database read to be authorised. A scope change takes effect when the
user's access token is next refreshed (at most `ACCESS_TOKEN_MINUTES`), and the
user is signed out at once because their refresh tokens are revoked.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import Forbidden, Unauthorised
from app.core.security import TokenError, decode_access_token
from app.modules.auth.scopes import ALL_SCOPE_IDS

_bearer = HTTPBearer(auto_error=False)


@dataclass
class Principal:
    user_id: str
    scopes: frozenset[str]
    is_superadmin: bool
    authorised_by: tuple[str, ...] = field(default_factory=tuple)

    def has(self, scope: str) -> bool:
        return self.is_superadmin or scope in self.scopes

    def has_all(self, scopes: tuple[str, ...]) -> bool:
        return all(self.has(s) for s in scopes)


async def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise Unauthorised()
    try:
        claims = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise Unauthorised("Your session has expired. Please sign in again.") from exc
    return Principal(claims.user_id, claims.scopes, claims.is_superadmin)


def require_scopes(*required: str) -> Callable[..., Principal]:
    """All listed scopes are required. A superadmin passes. No scope implies another."""
    if not required:
        raise ValueError("require_scopes needs at least one scope")
    unknown = set(required) - ALL_SCOPE_IDS
    if unknown:
        raise ValueError(f"unknown scope(s): {sorted(unknown)}")

    def dependency(
        request: Request, principal: Annotated[Principal, Depends(get_principal)]
    ) -> Principal:
        if not principal.has_all(required):
            raise Forbidden()
        principal.authorised_by = required
        request.state.principal = principal
        return principal

    dependency.required_scopes = required  # type: ignore[attr-defined]
    return dependency


def route_required_scopes(route: APIRoute) -> tuple[str, ...] | None:
    """Scopes a route demands, found by walking its dependencies. None if it has none."""
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        scopes = getattr(dep.call, "required_scopes", None)
        if scopes:
            return tuple(scopes)
        stack.extend(dep.dependencies)
    return None
