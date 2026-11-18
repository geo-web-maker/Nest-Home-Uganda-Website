"""Care forms API. Nurse routes live under /field (field:use + current consent); admin routes under /admin/care."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.core.deps import Principal, ReachContext, get_care_actor, require_scopes
from app.core.errors import AppError, Conflict, NotFound, ValidationFailed
from app.modules.audit import service as audit
from app.modules.care_clients.models import CareClient
from app.modules.care_forms import service
from app.modules.care_forms.models import CareFormCopyLog, CareFormInstance, CareFormSignature
from app.modules.field.service import require_current_consent
from app.modules.nurses.models import NurseProfile

router = APIRouter(prefix="/field/care-forms", tags=["care-forms"])
admin_router = APIRouter(prefix="/admin/care", tags=["care-forms-admin"])


class DraftIn(BaseModel):
    form_id: str = Field(min_length=1, max_length=8)
    client_id: str
    visit_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class ClientSignIn(BaseModel):
    role: str
    method: str
    name: str = Field(min_length=1, max_length=160)
    detail: dict[str, Any] = Field(default_factory=dict)
    evidence: dict[str, Any] = Field(default_factory=dict)
    image: str | None = None
    esign_consent: bool = False
    signer_email: str | None = Field(default=None, max_length=254)


class NurseSignIn(BaseModel):
    method: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    image: str | None = None


class RegistrationIn(BaseModel):
    unmc_number: str | None = Field(default=None, max_length=40)
    unmc_category: str | None = Field(default=None, max_length=80)
    unmc_licence_expiry: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")

    @field_validator("unmc_licence_expiry")
    @classmethod
    def validate_licence_expiry(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError("UNMC licence expiry must be a real ISO calendar date") from exc
        return value


def _out(i: CareFormInstance) -> dict[str, Any]:
    return {"id": str(i.id), "form_id": i.form_id, "client_id": i.client_id, "visit_id": i.visit_id, "version": i.version,
            "status": i.status, "data": i.data, "signed_at": i.signed_at, "document_hash": i.document_hash, "superseded": i.superseded}


# ------------------------------------------------------------------ nurse
@router.get("/me/registration")
async def my_registration(principal: Principal = Depends(require_current_consent)):
    p = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if p is None:
        raise NotFound("Nurse not found")
    return {"unmc_number": p.unmc_number, "unmc_category": p.unmc_category, "unmc_licence_expiry": p.unmc_licence_expiry,
            "verified": bool(p.unmc_verified_by), "status": "verified" if p.unmc_verified_by else "self-declared"}


@router.patch("/me/registration")
async def update_my_registration(body: RegistrationIn, principal: Principal = Depends(require_current_consent)):
    p = await NurseProfile.find_one(NurseProfile.user_id == principal.user_id)
    if p is None:
        raise NotFound("Nurse not found")
    before = {"unmc_number": p.unmc_number}
    changes = body.model_dump(exclude_unset=True)
    if changes:
        for k, v in changes.items():
            setattr(p, k, (v or None) if isinstance(v, str) else v)
        p.unmc_verified_by = p.unmc_verified_at = None  # any edit returns the details to self-declared
        await p.save()
        await audit.record(principal, "care.nurse.unmc.update", "nurse_profile", principal.user_id, None, before, {"app": "nurse"})
    return await my_registration(principal)


class SubmitIn(BaseModel):
    op_id: str = Field(min_length=8, max_length=80)
    form_id: str = Field(min_length=1, max_length=8)
    client_id: str
    visit_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    client_signature: ClientSignIn | None = None
    nurse_signature: NurseSignIn | None = None


@router.get("/bootstrap")
async def bootstrap(principal: Principal = Depends(require_current_consent)):
    return await service.bootstrap(principal.user_id)


@router.post("/submit")
async def submit(body: SubmitIn, principal: Principal = Depends(require_current_consent)):
    """Offline-safe: the app queues one op that saves the draft and applies whichever signatures were captured."""
    csig = body.client_signature.model_dump() if body.client_signature else None
    inst, copy = await service.submit(principal.user_id, op_id=body.op_id, form_id=body.form_id, client_id=body.client_id, visit_id=body.visit_id,
                                      data=body.data, client_sig=csig, nurse_sig=body.nurse_signature.model_dump() if body.nurse_signature else None)
    if inst.status == "signed":
        await audit.record(principal, "care.form.sign", "care_form", str(inst.id), inst.form_id, None, {"app": "nurse", "form_id": inst.form_id})
    return {**_out(inst), "copy": copy, "status_code": "ok"}


@router.get("")
async def list_documents(client_id: str | None = None, principal: Principal = Depends(require_current_consent)):
    q = [CareFormInstance.nurse_id == principal.user_id]
    if client_id:
        q.append(CareFormInstance.client_id == client_id)
    rows = await CareFormInstance.find(*q, CareFormInstance.superseded == False).sort("-updated_at").to_list()  # noqa: E712
    return {"items": [_out(r) for r in rows], "total": len(rows)}


@router.put("/drafts")
async def save_draft(body: DraftIn, principal: Principal = Depends(require_current_consent)):
    inst = await service.save_draft(principal.user_id, body.form_id, body.client_id, body.visit_id, body.data)
    return _out(inst)


@router.post("/{instance_id}/signatures", status_code=201)
async def client_sign(instance_id: str, body: ClientSignIn, principal: Principal = Depends(require_current_consent)):
    inst = await service.load_instance(instance_id, principal.user_id)
    inst = await service.add_client_signature(inst, role=body.role, method=body.method, name=body.name, detail=body.detail, evidence=body.evidence, image=body.image, esign_consent=body.esign_consent, signer_email=body.signer_email)
    return _out(inst)


@router.post("/{instance_id}/countersign")
async def countersign(instance_id: str, body: NurseSignIn, principal: Principal = Depends(require_current_consent)):
    inst = await service.load_instance(instance_id, principal.user_id)
    inst, _ = await service.countersign(inst, method=body.method, evidence=body.evidence, image=body.image)
    await audit.record(principal, "care.form.sign", "care_form", str(inst.id), inst.form_id, None, {"app": "nurse", "form_id": inst.form_id})
    copy = await service.send_copy(inst) if service.rules.needs_client_signature(inst.form_id) or inst.form_id in service.rules.OPTIONAL_CLIENT_FORMS else "skipped"
    return {**_out(inst), "copy": copy}


@router.get("/{instance_id}/pdf")
async def get_pdf(instance_id: str, principal: Principal = Depends(require_current_consent)):
    inst = await service.load_instance(instance_id, principal.user_id)
    return Response(await service.render_instance_pdf(inst), media_type="application/pdf", headers={"Cache-Control": "no-store"})


@router.post("/{instance_id}/resend")
async def resend(instance_id: str, principal: Principal = Depends(require_current_consent)):
    inst = await service.load_instance(instance_id, principal.user_id)
    if inst.status != "signed":
        raise Conflict("Only signed forms can be resent.")
    values = await service.care_values()
    if not values.get("care_forms.auto_email_copy", False):
        raise AppError("auto_email_off", "Copies are not emailed. Hand over a paper copy.", 409)
    return {"copy": await service.send_copy(inst, force=True)}


@router.get("/trackers/{client_id}/week")
async def tracker_week(client_id: str, start: date, principal: Principal = Depends(require_current_consent)):
    client = await service.assigned_client(client_id, principal.user_id)
    if not service.rules.tracker_allowed(client.patient_type):
        raise ValidationFailed("Daily trackers are only for patients set as Mama or Baby by admin.", {"client_id": "tracker_not_allowed"})
    inst = await CareFormInstance.find_one(CareFormInstance.client_id == client_id, CareFormInstance.form_id == "tracker", CareFormInstance.data["week_start"] == start.isoformat())
    if inst is None:
        raise NotFound("No tracker for that week yet")
    return Response(await service.render_instance_pdf(inst), media_type="application/pdf", headers={"Cache-Control": "no-store"})


# ------------------------------------------------------------------ admin
@admin_router.post("/nurses/{user_id}/unmc/verify")
async def verify_unmc(user_id: str, principal: Principal = Depends(require_scopes("nurses:write"))):
    p = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    if p is None:
        raise NotFound("Nurse not found")
    if user_id == principal.user_id:
        raise AppError("self_verification", "A different admin must verify your UNMC details.", 403)
    if not p.unmc_number:
        raise ValidationFailed("The nurse has not entered UNMC details yet.", {"unmc_number": "required"})
    try:
        expiry = date.fromisoformat(p.unmc_licence_expiry or "")
    except ValueError:
        raise ValidationFailed("The nurse must enter a valid UNMC licence expiry date before verification.", {"unmc_licence_expiry": "required"}) from None
    if expiry < date.today():
        raise ValidationFailed("The UNMC licence has expired and cannot be verified for signing.", {"unmc_licence_expiry": "expired"})
    p.unmc_verified_by, p.unmc_verified_at = principal.user_id, datetime.now(UTC)
    await p.save()
    await audit.record(principal, "care.nurse.unmc.verify", "nurse_profile", user_id, None, None, {"app": "admin"})
    return {"verified": True, "verified_by": principal.user_id, "verified_at": p.unmc_verified_at}


@admin_router.get("/care-forms")
async def admin_list(client_id: str, _: Principal = Depends(require_scopes("clients:read")), ctx: ReachContext = Depends(get_care_actor)):
    from app.modules.care_admin.router import _client_reachable

    client = await CareClient.find_one(CareClient.id == client_id)
    if client is None or not await _client_reachable(client, ctx):
        raise NotFound("Client not found")
    rows = await CareFormInstance.find(CareFormInstance.client_id == client_id).sort("-updated_at").to_list()
    out = []
    for r in rows:
        sigs = await CareFormSignature.find(CareFormSignature.instance_id == str(r.id)).to_list()
        # The admin list is a metadata index only. Clinical form data is available
        # solely inside the sealed PDF route after the same client-reach check.
        out.append({
            "id": str(r.id),
            "form_id": r.form_id,
            "client_id": r.client_id,
            "visit_id": r.visit_id,
            "version": r.version,
            "status": r.status,
            "signed_at": r.signed_at,
            "document_hash": r.document_hash,
            "superseded": r.superseded,
            "signatures": [{"role": s.role, "name": s.name, "method": s.method, "signed_at": s.signed_at,
                            "registration_line": s.registration_line, "document_hash": s.document_hash} for s in sigs],
        })
    return {"items": out, "total": len(out)}


@admin_router.get("/care-forms/copy-log")
async def copy_log(limit: int = 100, _: Principal = Depends(require_scopes("carecfg:read"))):
    limit = max(1, min(limit, 500))
    rows = await CareFormCopyLog.find().sort("-at").limit(limit).to_list()
    return {"items": [r.model_dump(mode="json", exclude={"id", "revision_id"}) for r in rows]}


@admin_router.get("/care-forms/{instance_id}/pdf")
async def admin_care_form_pdf(
    instance_id: str,
    _: Principal = Depends(require_scopes("clients:read")),
    ctx: ReachContext = Depends(get_care_actor),
):
    """Admin read-only access to a client's sealed care document; enforce the same reach boundary as the client page."""
    from app.modules.care_admin.router import _client_reachable

    inst = await service.load_instance(instance_id)
    if inst.status != "signed":
        raise Conflict("Only signed care forms have a sealed PDF.")
    client = await CareClient.find_one(CareClient.id == inst.client_id)
    if client is None or not await _client_reachable(client, ctx):
        raise NotFound("Care form not found")
    return Response(
        await service.render_instance_pdf(inst),
        media_type="application/pdf",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@admin_router.get("/switch-app")
async def switch_to_nurse_app(principal: Principal = Depends(require_scopes("field:use"))):
    """Only dual-scope staff can obtain the nurse app URL from the admin session."""
    url = get_settings().nurse_frontend_url.strip()
    if not url:
        raise NotFound("The nurse app URL has not been configured.")
    return {"url": url}


class OrderIn(BaseModel):
    client_id: str
    nurse_id: str
    order: dict[str, str] = Field(default_factory=dict)


@admin_router.put("/care-forms/08-orders")
async def set_order(body: OrderIn, principal: Principal = Depends(require_scopes("clients:write"))):
    inst = await service.set_form_08_order(body.client_id, body.nurse_id, body.order)
    await audit.record(principal, "care.form08.order", "care_form", str(inst.id), "08", None, {"app": "admin"})
    return _out(inst)
