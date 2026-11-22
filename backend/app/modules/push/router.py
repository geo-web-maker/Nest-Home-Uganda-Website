"""Push diagnostics API. Every route needs the push:diagnostics scope AND a verified authenticator (TOTP) session."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import Principal, require_scopes
from app.core.errors import NotFound
from app.core.totp_guard import assert_totp_session
from app.modules.push import diagnostics

router = APIRouter(prefix="/admin/push/diagnostics", tags=["push-diagnostics"])
CanDiagnose = Annotated[Principal, Depends(require_scopes("push:diagnostics"))]


class TestSend(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_id: str = Field(min_length=1, max_length=120)
    title: str = Field(default="Push test", max_length=120)
    body: str = Field(default="If you can read this, push works.", max_length=300)
    critical: bool = False
    validate_only: bool = False


class ExplainBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user: str = Field(min_length=1, max_length=200)
    mailbox_id: str | None = Field(default=None, max_length=64)
    app: Literal["any", "admin", "nurse"] = "any"


class ScenarioBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user: str = Field(min_length=1, max_length=200)
    scenario: str = Field(min_length=1, max_length=40)


async def _guard(principal: Principal, token: str | None, response: Response) -> None:
    await assert_totp_session(principal, token)
    response.headers["Cache-Control"] = "no-store"


@router.post("/run")
async def run_checks(response: Response, principal: CanDiagnose, mail_totp: str | None = Cookie(default=None)):
    """Passive checks: settings, key, devices and recent delivery results. Contacts nobody."""
    await _guard(principal, mail_totp, response)
    checks = await diagnostics.run_passive_checks()
    return {"checks": [c.as_dict() for c in checks], "summary": diagnostics.summarize(checks)}


@router.post("/google-auth")
async def google_auth(response: Response, principal: CanDiagnose, mail_totp: str | None = Cookie(default=None)):
    """Live: prove Google accepts the service account key. Sends no notification."""
    await _guard(principal, mail_totp, response)
    return {"check": (await diagnostics.check_google_auth()).as_dict()}


@router.get("/devices")
async def devices(response: Response, principal: CanDiagnose, user: str | None = None,
                  app: Literal["any", "admin", "nurse"] = "any", mail_totp: str | None = Cookie(default=None)):
    await _guard(principal, mail_totp, response)
    user_id = None
    if user:
        found = await diagnostics.find_user(user)
        if found is None:
            raise NotFound("No user with that e-mail or id.")
        user_id = str(found.id)
    return {"devices": await diagnostics.list_devices(user_id, app=app)}


@router.get("/deliveries")
async def deliveries(response: Response, principal: CanDiagnose, status: str | None = None,
                     mail_totp: str | None = Cookie(default=None)):
    await _guard(principal, mail_totp, response)
    return {"deliveries": await diagnostics.recent_deliveries(status)}


@router.post("/explain")
async def explain(body: ExplainBody, response: Response, principal: CanDiagnose,
                  mail_totp: str | None = Cookie(default=None)):
    """Why would (or wouldn't) this person get a mail notification?"""
    await _guard(principal, mail_totp, response)
    return await diagnostics.explain_user(body.user, mailbox_id=body.mailbox_id, app=body.app)


@router.post("/send")
async def send(body: TestSend, response: Response, principal: CanDiagnose,
               mail_totp: str | None = Cookie(default=None)):
    """Send one test (or a validate-only dry run) straight to a device and return Google's exact answer."""
    await _guard(principal, mail_totp, response)
    return await diagnostics.send_test(
        body.device_id, title=body.title, body=body.body, critical=body.critical, validate_only=body.validate_only
    )


@router.post("/pipeline")
async def pipeline(response: Response, principal: CanDiagnose, mail_totp: str | None = Cookie(default=None)):
    """Send a labelled notification to YOUR OWN devices through the real dispatcher."""
    await _guard(principal, mail_totp, response)
    return await diagnostics.run_pipeline_test(principal.user_id)


@router.get("/scenarios")
async def scenarios(response: Response, principal: CanDiagnose, mail_totp: str | None = Cookie(default=None)):
    """The real notifications the apps receive, so a test can reproduce each one."""
    await _guard(principal, mail_totp, response)
    return {"scenarios": [{"id": k, "title": v[1], "category": v[0], "critical": v[4]} for k, v in diagnostics.SCENARIOS.items()]}


@router.post("/scenario")
async def scenario(body: ScenarioBody, response: Response, principal: CanDiagnose,
                   mail_totp: str | None = Cookie(default=None)):
    """Send one real-looking notification (visit, timesheet, mail, safety alert) to a person via the real dispatcher."""
    await _guard(principal, mail_totp, response)
    return await diagnostics.send_scenario(body.user, body.scenario)
