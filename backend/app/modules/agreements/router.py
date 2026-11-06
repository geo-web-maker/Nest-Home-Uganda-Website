from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.core.deps import Principal, require_scopes
from app.core.errors import Conflict, NotFound
from app.core.rate_limit import client_ip, limiter
from app.core.security import hash_ip
from app.core.totp_guard import assert_totp_session
from app.modules.agreements import diagnostics, messages, rules, service
from app.modules.agreements.models import Agreement, AgreementTemplate
from app.modules.agreements.schemas import (
    AgreementCreate, AgreementPatch, AmendmentCreate, CountersignAgreement, MessageTemplatePatch,
    OtpRequest, OtpVerify, RequestChange, SendAgreement, SignAgreement,
    TemplateDraft, VoidAgreement,
)
from app.modules.auth.models import User
from app.modules.notifications.config import load_config
from app.modules.notifications.providers import get_email_provider, get_sms_provider
from app.modules.notifications.service import send_sms

admin_router = APIRouter(prefix="/admin/agreements", tags=["admin-agreements"])
public_router = APIRouter(prefix="/public/agreements", tags=["public-agreements"])

CanRead = Annotated[Principal, Depends(require_scopes("agreements:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("agreements:write"))]
CanTemplates = Annotated[Principal, Depends(require_scopes("agreements:templates"))]
CanAgreementWorkflowTest = Annotated[Principal, Depends(require_scopes("agreements:templates", "agreements:sign"))]


class InPersonStart(BaseModel):
    duration_minutes: int = Field(default=15, ge=5, le=60)


def _token_rate_limit(name: str, limit: int, window_seconds: int):
    def dependency(token: str, request: Request) -> None:
        import hashlib
        key = hashlib.sha256(f"{name}:{hash_ip(client_ip(request))}:{hashlib.sha256(token.encode()).hexdigest()}".encode()).hexdigest()
        retry_after = limiter.hit(key, limit, window_seconds)
        if retry_after is not None:
            from app.core.errors import RateLimited
            raise RateLimited(retry_after)
    return dependency


def _session_rate_limit(name: str, limit: int, window_seconds: int):
    def dependency(request: Request, agreement_session: str | None = Cookie(default=None)) -> None:
        import hashlib
        session_hash = hashlib.sha256((agreement_session or "missing").encode()).hexdigest()
        key = hashlib.sha256(f"{name}:{hash_ip(client_ip(request))}:{session_hash}".encode()).hexdigest()
        retry_after = limiter.hit(key, limit, window_seconds)
        if retry_after is not None:
            from app.core.errors import RateLimited
            raise RateLimited(retry_after)
    return dependency


@admin_router.get("/template/current")
async def admin_template(_: CanRead):
    versions = await AgreementTemplate.find().sort("-version").limit(20).to_list()
    template = versions[0] if versions else None
    if template is None:
        return {"published": False, "message": "Load the verbatim source agreement clauses before publishing."}
    return {"version": template.version, "clauses": template.clauses,
            "template_hash": template.template_hash, "published": template.is_published,
            "published_at": template.published_at, "source_file": template.source_file,
            "versions": [{"version": item.version, "published": item.is_published,
                          "template_hash": item.template_hash, "published_at": item.published_at,
                          "source_file": item.source_file} for item in versions],
            "published_version": next((item.version for item in versions if item.is_published), None)}


@admin_router.get("/template/versions")
async def admin_template_versions(_: CanRead):
    versions = await AgreementTemplate.find().sort("-version").limit(50).to_list()
    return {"items": [{"version": item.version, "published": item.is_published,
                        "template_hash": item.template_hash, "published_at": item.published_at,
                        "source_file": item.source_file} for item in versions]}


@admin_router.get("/template/{version}")
async def admin_template_version(version: int, _: CanRead):
    template = await AgreementTemplate.find_one(AgreementTemplate.version == version)
    if template is None:
        raise NotFound("Agreement template version not found")
    return {"version": template.version, "clauses": template.clauses,
            "template_hash": template.template_hash, "published": template.is_published,
            "published_at": template.published_at, "source_file": template.source_file}


@admin_router.get("")
async def admin_list(
    _: CanRead,
    status: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=100),
    nurse: str | None = Query(default=None, max_length=30),
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
):
    return await service.list_agreements(status=status, q=q, assigned_nurse_id=nurse, limit=limit, skip=skip)


@admin_router.post("", status_code=201)
async def admin_create(body: AgreementCreate, principal: CanWrite, request: Request):
    doc = await service.create(principal, body, hash_ip(client_ip(request)))
    return service.agreement_detail(doc)


@admin_router.post("/diagnostics/run")
async def admin_diagnostics_run(principal: CanTemplates, response: Response,
                                mail_totp: str | None = Cookie(default=None)):
    """Run passive readiness checks. No client message is sent."""
    await assert_totp_session(principal, mail_totp)
    checks = await diagnostics.run_readiness_checks()
    response.headers["Cache-Control"] = "no-store"
    return {"checks": [item.as_dict() for item in checks], "summary": diagnostics.summarize(checks)}


@admin_router.post("/diagnostics/workflow")
async def admin_diagnostics_workflow(principal: CanAgreementWorkflowTest, response: Response,
                                     mail_totp: str | None = Cookie(default=None)):
    """Exercise the real agreement flow using synthetic data and intercepted notifications."""
    await assert_totp_session(principal, mail_totp)
    checks = await diagnostics.run_workflow_simulation(principal)
    response.headers["Cache-Control"] = "no-store"
    return {"checks": [item.as_dict() for item in checks], "summary": diagnostics.summarize(checks)}


@admin_router.post("/diagnostics/delivery-test/{channel}")
async def admin_diagnostics_delivery(channel: Literal["email", "sms"], principal: CanTemplates,
                                     response: Response,
                                     mail_totp: str | None = Cookie(default=None)):
    """Send one clearly labelled test to the authenticated staff member only."""
    await assert_totp_session(principal, mail_totp)
    check = await diagnostics.run_staff_delivery_test(principal, channel)
    response.headers["Cache-Control"] = "no-store"
    return {"check": check.as_dict()}


@admin_router.get("/{agreement_id}")
async def admin_get(agreement_id: str, _: CanRead):
    return service.agreement_detail(await service.get_agreement(agreement_id))


@admin_router.patch("/{agreement_id}")
async def admin_patch(agreement_id: str, body: AgreementPatch, principal: CanWrite, request: Request):
    doc = await service.get_agreement(agreement_id)
    doc = await service.patch_fields(doc, body.changes, actor="staff", principal=principal,
                                    ip=hash_ip(client_ip(request)), user_agent=request.headers.get("user-agent"))
    return service.agreement_detail(doc)


@admin_router.post("/{agreement_id}/send")
async def admin_send(agreement_id: str, body: SendAgreement, principal: CanWrite, request: Request):
    doc = await service.get_agreement(agreement_id)
    return await service.send(doc, principal, body, hash_ip(client_ip(request)))


@admin_router.post("/{agreement_id}/resend")
async def admin_resend(agreement_id: str, principal: CanWrite, request: Request):
    doc = await service.get_agreement(agreement_id)
    return await service.reissue_link(doc, principal, doc.channel_preference,
                                      hash_ip(client_ip(request)))


@admin_router.post("/{agreement_id}/reissue-link")
async def admin_reissue(agreement_id: str, principal: CanWrite, request: Request,
                        channels: Literal["email", "sms", "both"] = "both"):
    doc = await service.get_agreement(agreement_id)
    return await service.reissue_link(doc, principal, channels, hash_ip(client_ip(request)))


@admin_router.post("/{agreement_id}/countersign")
async def admin_countersign(agreement_id: str, body: CountersignAgreement, request: Request,
                            principal: Principal = Depends(require_scopes("agreements:sign"))):
    doc = await service.get_agreement(agreement_id)
    return await service.countersign(doc, principal, body.name, body.method,
                                     body.signature_base64, hash_ip(client_ip(request)),
                                     request.headers.get("user-agent"))


@admin_router.post("/{agreement_id}/void")
async def admin_void(agreement_id: str, body: VoidAgreement, request: Request,
                     principal: Principal = Depends(require_scopes("agreements:void")),
                     mail_totp: str | None = Cookie(default=None)):
    await assert_totp_session(principal, mail_totp)
    doc = await service.get_agreement(agreement_id)
    await service.void(doc, principal, body.reason, hash_ip(client_ip(request)))
    return service.agreement_detail(doc)


@admin_router.post("/{agreement_id}/in-person/start")
async def admin_in_person_start(agreement_id: str, body: InPersonStart, principal: CanWrite):
    # Do not issue an unbacked tablet token. The staged S6 kiosk flow needs its own
    # persisted, one-use session record and public tablet endpoints before activation.
    doc = await service.get_agreement(agreement_id)
    if doc.status not in {"draft", "sent", "client_in_progress"}:
        raise Conflict("In-person review is available only for an open agreement")
    raise HTTPException(status_code=501, detail="The in-person tablet flow is not enabled yet")


@admin_router.get("/{agreement_id}/sealed-pdf")
async def admin_sealed_pdf(agreement_id: str, _: CanRead):
    doc = await service.get_agreement(agreement_id)
    content = await service.get_sealed_pdf(doc)
    return Response(content=content, media_type="application/pdf", headers={
        "Cache-Control": "no-store", "Content-Disposition": f'inline; filename="{doc.reference}.pdf"',
        "X-Content-Type-Options": "nosniff",
    })


@admin_router.get("/{agreement_id}/events")
async def admin_events(agreement_id: str, _: CanRead):
    doc = await service.get_agreement(agreement_id)
    return {"items": [event.model_dump(mode="json") for event in doc.events]}


@admin_router.get("/{agreement_id}/preview-data")
async def admin_preview_data(agreement_id: str, _: CanRead):
    return {"html": await service.preview_agreement(await service.get_agreement(agreement_id))}


@admin_router.get("/{agreement_id}/preview", response_class=HTMLResponse)
async def admin_preview(agreement_id: str, _: CanRead, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return HTMLResponse(await service.preview_agreement(await service.get_agreement(agreement_id)),
                        headers={"Cache-Control": "no-store"})


@admin_router.post("/{agreement_id}/amend", status_code=201)
async def admin_amend(agreement_id: str, body: AmendmentCreate, principal: CanWrite, request: Request):
    doc = await service.get_agreement(agreement_id)
    amendment = await service.amend(doc, principal, body.variation_clause, hash_ip(client_ip(request)))
    return service.agreement_detail(amendment)


@admin_router.post("/template/drafts", status_code=201)
async def admin_template_draft(body: TemplateDraft, principal: CanTemplates):
    template = await service.save_template_draft(body, principal)
    return {"version": template.version, "clauses": template.clauses,
            "template_hash": template.template_hash, "published": False}


@admin_router.post("/template/{version}/publish")
async def admin_template_publish(version: int, principal: CanTemplates,
                                 request: Request, mail_totp: str | None = Cookie(default=None)):
    await assert_totp_session(principal, mail_totp)
    template = await service.publish_template(version, principal, hash_ip(client_ip(request)))
    return {"version": template.version, "template_hash": template.template_hash,
            "published": template.is_published}


@admin_router.get("/message-templates/{stage_key}/{channel}")
async def admin_message_template(stage_key: str, channel: Literal["email", "sms"], _: CanTemplates):
    template, version, is_default = await messages.get_template(stage_key, channel)
    return {"stage_key": stage_key, "channel": channel, **template.__dict__,
            "version": version, "is_default": is_default}


@admin_router.put("/message-templates/{stage_key}/{channel}")
async def admin_message_template_save(stage_key: str, channel: Literal["email", "sms"],
                                      body: MessageTemplatePatch, principal: CanTemplates):
    template = await service.save_message_template(stage_key, channel, body, principal)
    return {"stage_key": stage_key, "channel": channel, "version": template.version,
            "is_default": False, "updated_at": template.updated_at}


@admin_router.post("/message-templates/{stage_key}/{channel}/preview")
async def admin_message_template_preview(stage_key: str, channel: Literal["email", "sms"],
                                         body: MessageTemplatePatch, _: CanTemplates):
    template = messages.DefaultMessage(**body.model_dump())
    sample = {"client_name": "Amina N.", "client_first_name": "Amina", "reference": "BHC-2026-0001",
              "link": "https://bhcug.com/agreement/sample-token", "code": "123456",
              "expires_days": "14", "expires_date": "2026-11-20", "company": "Bloomwell Home Care Uganda Limited",
              "support_phone": "0787499988", "support_email": "info@bhcug.com", "staff_name": "Staff member", "reason": "Please clarify the start date"}
    try:
        messages.validate_template(stage_key, channel, body.model_dump())
        if channel == "sms":
            rendered = messages.render_variables(template.body, sample)
            return {"body": rendered, "characters": len(rendered), "segments": messages.sms_segments(rendered),
                    "gsm7": messages.is_gsm7(rendered)}
        subject, html_body, plain = messages.render_email(stage_key, template, sample)
        return {"subject": subject, "html": html_body, "text": plain}
    except ValueError as exc:
        raise Conflict(str(exc)) from exc


@admin_router.post("/message-templates/{stage_key}/{channel}/test-send")
async def admin_message_template_test_send(stage_key: str, channel: Literal["email", "sms"],
                                           principal: CanTemplates,
                                           mail_totp: str | None = Cookie(default=None)):
    """Send a conspicuously labelled preview only to the authenticated staff member."""
    await assert_totp_session(principal, mail_totp)
    user = await User.get(service._oid(principal.user_id))
    if user is None or not user.is_active:
        raise NotFound("Staff account not found")
    template, version, _ = await messages.get_template(stage_key, channel)
    sample = {"client_name": "Staff test", "client_first_name": "Staff", "reference": "BHC-TEST-DELIVERY",
              "link": "https://bhcug.com/agreement/DIAGNOSTICS-NOT-A-REAL-AGREEMENT", "code": "123456",
              "expires_days": "14", "expires_date": "2030-01-01", "company": "Bloomwell Home Care Uganda Limited",
              "support_phone": "0787499988", "support_email": "info@bhcug.com", "staff_name": user.name, "reason": "Staff test message"}
    if channel == "email":
        ready, reason = await service._channel_delivery_readiness("email", user.email)
        if not ready:
            raise Conflict(f"Staff email test was not sent. {reason}")
        subject, html_body, plain = messages.render_email(stage_key, template, sample)
        marker = '<p style="padding:12px;background:#fff2cc;color:#5c4300;font-weight:bold">STAFF TEST ONLY — NOT A CLIENT AGREEMENT. The sample link and code are inactive.</p>'
        body_start = html_body.find(">", html_body.find("<body"))
        marked_html = html_body[:body_start + 1] + marker + html_body[body_start + 1:] if body_start >= 0 else marker + html_body
        result = await get_email_provider().send(
            [user.email], f"[TEST ONLY] {subject}", marked_html,
            "STAFF TEST ONLY — NOT A CLIENT AGREEMENT. The sample link and code are inactive.\n\n" + plain,
        )
        accepted = bool(result.ok and getattr(result, "provider_message_id", None) != "console")
    else:
        phone = user.phone_e164
        if not phone:
            raise Conflict("Add a verified mobile number to your staff profile before testing SMS")
        ready, reason = await service._channel_delivery_readiness("sms", phone)
        if not ready:
            raise Conflict(f"Staff SMS test was not sent. {reason}")
        config = await load_config()
        rendered_sms = messages.render_variables(template.body, sample)
        # Keep the required Bloomwell sender prefix and mark the test before the
        # original copy, so no recipient could mistake it for a live agreement.
        marked_sms = "Bloomwell: TEST ONLY. " + rendered_sms.removeprefix("Bloomwell:").strip()
        try:
            messages.validate_rendered_sms(marked_sms)
        except ValueError as exc:
            raise Conflict(f"The test SMS is too long or invalid after adding the safety label: {exc}") from exc
        accepted = await send_sms(get_sms_provider(), config, to=phone, text=marked_sms,
                                  audience="agreement_template_test", template="agreement_template_test", enquiry=None)
    await service.audit.record(principal, "agreement.message_template_test_sent", "agreement_message_template",
                               item_label=f"{stage_key}/{channel}", after={"channel": channel, "version": version,
                                                                            "accepted": bool(accepted)})
    return {"sent": bool(accepted), "message": "Test accepted by the provider; check your own device." if accepted else "Test was not accepted by the external provider."}


@admin_router.post("/message-templates/{stage_key}/{channel}/reset")
async def admin_message_template_reset(stage_key: str, channel: Literal["email", "sms"], principal: CanTemplates):
    await service.reset_message_template(stage_key, channel, principal)
    template, version, _ = await messages.get_template(stage_key, channel)
    return {"reset": True, "version": version, **template.__dict__}


@public_router.get("/session", dependencies=[Depends(_session_rate_limit("agreement_session", 30, 900))])
async def public_session(response: Response, agreement_session: str | None = Cookie(default=None)):
    doc, _ = await service.session_agreement(agreement_session, "sign")
    result = await service.public_view(doc)
    response.headers["Cache-Control"] = "no-store"
    return result


@public_router.get("/{token}", dependencies=[Depends(_token_rate_limit("agreement_pre_otp", 40, 900))])
async def public_pre_otp(token: str, response: Response):
    digest = service._token_hash(token)
    doc = await Agreement.find_one(Agreement.token_hash == digest)
    purpose = "sign"
    if doc is None:
        doc = await Agreement.find_one(Agreement.view_token_hash == digest)
        purpose = "view"
    if doc is None:
        raise NotFound("This agreement link is no longer active")
    if purpose == "sign" and (not doc.token_expires_at or doc.token_expires_at <= datetime.now(UTC)):
        raise NotFound("This agreement link has expired")
    phone_field = doc.fields.get(rules.field_key("client.phone"))
    email_field = doc.fields.get(rules.field_key("client.email"))
    phone = phone_field.value if phone_field else ""
    email = email_field.value if email_field else ""
    sms_ready, _ = await service._channel_delivery_readiness("sms", phone)
    email_ready, _ = await service._channel_delivery_readiness("email", email)
    response.headers["Cache-Control"] = "no-store"
    return {"company": "Bloomwell Home Care Uganda Limited", "message": "Verify to continue",
            "phone_hint": (str(phone)[:4] + "***" + str(phone)[-3:]) if phone else None,
            "email_hint": (str(email).split("@", 1)[0][:1] + "***@" + str(email).split("@", 1)[-1]) if email else None,
            "available_channels": {"sms": sms_ready, "email": email_ready},
            "purpose": purpose}


@public_router.post("/{token}/otp/request", dependencies=[Depends(_token_rate_limit("agreement_otp", 5, 900))])
async def public_otp_request(token: str, body: OtpRequest, request: Request, response: Response):
    result = await service.request_otp(token, "sign", body, client_ip(request))
    response.headers["Cache-Control"] = "no-store"
    return result


@public_router.post("/{token}/otp/request-view", dependencies=[Depends(_token_rate_limit("agreement_view_otp", 5, 900))])
async def public_view_otp_request(token: str, body: OtpRequest, request: Request, response: Response):
    result = await service.request_otp(token, "view", body, client_ip(request))
    response.headers["Cache-Control"] = "no-store"
    return result


@public_router.post("/{token}/otp/verify", dependencies=[Depends(_token_rate_limit("agreement_otp_verify", 10, 900))])
async def public_otp_verify(token: str, body: OtpVerify, request: Request, response: Response):
    doc, session_token = await service.verify_otp(token, "sign", body.code, client_ip(request))
    service.session_cookie(session_token, response)
    response.headers["Cache-Control"] = "no-store"
    return {"verified": True, "reference": doc.reference, "next": "review"}


@public_router.post("/{token}/otp/verify-view", dependencies=[Depends(_token_rate_limit("agreement_view_otp_verify", 10, 900))])
async def public_view_otp_verify(token: str, body: OtpVerify, request: Request, response: Response):
    doc, session_token = await service.verify_otp(token, "view", body.code, client_ip(request))
    service.session_cookie(session_token, response)
    response.headers["Cache-Control"] = "no-store"
    return {"verified": True, "reference": doc.reference, "next": "signed"}


@public_router.patch("/session/fields", dependencies=[Depends(_session_rate_limit("agreement_fields", 20, 900))])
async def public_patch(body: AgreementPatch, request: Request, response: Response,
                       agreement_session: str | None = Cookie(default=None)):
    doc, _ = await service.session_agreement(agreement_session, "sign")
    doc = await service.patch_fields(doc, body.changes, actor="client", ip=hash_ip(client_ip(request)),
                                     user_agent=request.headers.get("user-agent"))
    response.headers["Cache-Control"] = "no-store"
    return await service.public_view(doc)


@public_router.post("/session/request-change", dependencies=[Depends(_session_rate_limit("agreement_change", 5, 900))])
async def public_request_change(body: RequestChange, request: Request, response: Response,
                                agreement_session: str | None = Cookie(default=None)):
    doc, _ = await service.session_agreement(agreement_session, "sign")
    await service.request_change(doc, body.reason, client_ip(request))
    response.headers["Cache-Control"] = "no-store"
    return {"requested": True, "message": "Your request has been sent to Bloomwell."}


@public_router.post("/session/sign", dependencies=[Depends(_session_rate_limit("agreement_sign", 5, 900))])
async def public_sign(body: SignAgreement, request: Request, response: Response,
                      agreement_session: str | None = Cookie(default=None)):
    doc, _ = await service.session_agreement(agreement_session, "sign")
    content_hash = await service.client_sign(doc, body, client_ip(request), request.headers.get("user-agent"))
    response.headers["Cache-Control"] = "no-store"
    return {"signed": True, "reference": doc.reference, "content_hash": content_hash,
            "message": "Your signature has been received. Bloomwell will countersign the agreement."}


@public_router.get("/session/signed", dependencies=[Depends(_session_rate_limit("agreement_signed_view", 30, 900))])
async def public_signed(response: Response, agreement_session: str | None = Cookie(default=None)):
    doc, _ = await service.session_agreement(agreement_session, "view")
    result = await service.public_view(doc, signed=True)
    response.headers["Cache-Control"] = "no-store"
    return result
