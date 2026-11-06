from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    scopes: list[str]
    is_superadmin: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
    csrf_token: str
    user: UserPublic


class PasswordChangeRequiredResponse(BaseModel):
    """Returned instead of a session when the caller signed in with a temporary password."""

    password_change_required: bool = True
    set_password_token: str
    purpose: str  # "invite" | "reset"
    expires_in: int


class ScopeOut(BaseModel):
    id: str
    group: str
    label: str


class NativeLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserPublic


class NativeRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=500)
