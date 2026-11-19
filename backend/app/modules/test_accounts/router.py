from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core import sandbox
from app.core.deps import Principal
from app.core.errors import Forbidden
from app.core.totp_guard import require_totp_session
from app.modules.test_accounts import client as test_client
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


class ClientEnableBody(BaseModel):
    patient_type: Literal["General", "Mama", "Baby"] | None = None


class ClientScenarioBody(BaseModel):
    name: str


class ClientVisitBody(BaseModel):
    day: int = Field(default=0, ge=-14, le=21)  # days from today; negative is the past
    at: str = "09:00"
    length: int = Field(default=60, ge=15, le=480)
    state: Literal["scheduled", "in_progress", "completed", "overdue_checkout"] = "scheduled"


class ClientDaysBody(BaseModel):
    days: int = Field(default=0, ge=-14, le=14)
    back_to_today: bool = False


class ClientLocationBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=150, ge=50, le=1000)


class ClientTypeBody(BaseModel):
    patient_type: Literal["General", "Mama", "Baby"]


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


@router.post("/client/enable")
async def client_enable(body: ClientEnableBody, principal: Principal = Depends(_superadmin)):
    return await test_client.enable(principal, body.patient_type)


@router.post("/client/disable")
async def client_disable(principal: Principal = Depends(_superadmin)):
    return await test_client.disable(principal)


@router.post("/client/scenario")
async def client_scenario(body: ClientScenarioBody, principal: Principal = Depends(_superadmin)):
    return await test_client.apply_scenario(principal, body.name)


@router.post("/client/visits")
async def client_add_visit(body: ClientVisitBody, principal: Principal = Depends(_superadmin)):
    return await test_client.add_visit(principal, day=body.day, at=body.at, length=body.length, state=body.state)


@router.post("/client/days")
async def client_days(body: ClientDaysBody, principal: Principal = Depends(_superadmin)):
    if body.back_to_today:
        return await test_client.back_to_today(principal)
    return await test_client.shift_days(principal, body.days)


@router.post("/client/checks")
async def client_checks(principal: Principal = Depends(_superadmin)):
    return {"checks": await test_client.run_checks(principal)}


@router.post("/client/location")
async def client_location(body: ClientLocationBody, principal: Principal = Depends(_superadmin)):
    return await test_client.set_location(principal, lat=body.lat, lng=body.lng, radius_m=body.radius_m)


@router.post("/client/type")
async def client_type(body: ClientTypeBody, principal: Principal = Depends(_superadmin)):
    return await test_client.set_patient_type(principal, body.patient_type)


@router.post("/{key}/access")
async def set_access(key: str, body: AccessBody, principal: Principal = Depends(_superadmin)):
    return await service.set_access(principal, key, preset=body.preset, scopes=body.scopes, reach=body.reach)


@router.post("/{key}/activate")
async def activate_account(key: str, principal: Principal = Depends(_superadmin)):
    return await service.activate(principal, key)


@router.post("/{key}/deactivate")
async def deactivate_account(key: str, principal: Principal = Depends(_superadmin)):
    return await service.deactivate(principal, key)
