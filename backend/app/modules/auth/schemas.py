from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
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


class ScopeOut(BaseModel):
    id: str
    group: str
    label: str
