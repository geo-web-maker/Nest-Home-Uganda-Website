from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core import sandbox
from app.core.deps import Principal
from app.core.errors import Forbidden
from app.core.totp_guard import require_totp_session
from app.modules.test_accounts import service

router = APIRouter(prefix="/admin/test-accounts", tags=["test-accounts"])


def _superadmin(principal: Principal = Depends(require_totp_session)) -> Principal:
    """Superadmin with a verified authenticator session. A missing session raises totp_required first."""
    if not principal.is_superadmin:
        raise Forbidden("Super administrator access required.")
    sandbox.reveal()  # this screen manages the test data, so it must see it
    return principal


class AccessBody(BaseModel):
    preset: str | None = None
    scopes: list[str] | None = None
    reach: str | None = None


class LinkBody(BaseModel):
    supervises: bool


class MasterBody(BaseModel):
    enabled: bool


class ConfigBody(BaseModel):
    delivery: str | None = None
    emails: list[str] | None = None
    phones: list[str] | None = None


class ScenarioBody(BaseModel):
    name: str


@router.get("")
async def list_accounts(_: Principal = Depends(_superadmin)):
    return await service.list_test_accounts()


@router.post("/master")
async def set_master(body: MasterBody, principal: Principal = Depends(_superadmin)):
    return await service.set_master(principal, body.enabled)


@router.put("/config")
async def update_config(body: ConfigBody, principal: Principal = Depends(_superadmin)):
    return await service.update_config(principal, delivery=body.delivery, emails=body.emails, phones=body.phones)


@router.post("/scenario")
async def apply_scenario(body: ScenarioBody, principal: Principal = Depends(_superadmin)):
    return await service.apply_scenario(principal, body.name)


@router.post("/link")
async def set_link(body: LinkBody, principal: Principal = Depends(_superadmin)):
    return await service.set_link(principal, body.supervises)


@router.post("/reset-data")
async def reset_data(principal: Principal = Depends(_superadmin)):
    return await service.reset_data(principal)


@router.post("/{key}/access")
async def set_access(key: str, body: AccessBody, principal: Principal = Depends(_superadmin)):
    return await service.set_access(principal, key, preset=body.preset, scopes=body.scopes, reach=body.reach)


@router.post("/{key}/activate")
async def activate_account(key: str, principal: Principal = Depends(_superadmin)):
    return await service.activate(principal, key)


@router.post("/{key}/deactivate")
async def deactivate_account(key: str, principal: Principal = Depends(_superadmin)):
    return await service.deactivate(principal, key)
