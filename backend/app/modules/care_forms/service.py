"""Care forms service: context building, drafts, signing, gates, PDFs and the optional client copy."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from beanie import PydanticObjectId

from app.core.errors import AppError, Conflict, NotFound, ValidationFailed
from app.modules.agreements.blocks import MARK_SVG
from app.modules.agreements.models import Agreement
from app.modules.auth.models import User
from app.modules.care_clients.models import CareClient
from app.modules.care_forms import rules
from app.modules.care_forms.context import MissingProfileField, build_context, patient_from_agreement, registration_line, tracker_context
from app.modules.care_forms.models import CareFormCopyLog, CareFormInstance, CareFormSignature
from app.modules.care_forms.render import content_hash, render_html, render_pdf, template_for
from app.modules.nurses.models import NurseProfile
from app.modules.settings.care_service import care_values

log = logging.getLogger(__name__)
MAX_IMAGE_CHARS = 300_000


# ----------------------------------------------------------------------------- lookups

def _expiry(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


async def author_for(user_id: str) -> dict[str, Any]:
    profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
    try:
        user = await User.get(PydanticObjectId(user_id))
    except Exception:  # noqa: BLE001 - malformed id: treated as missing
        user = None
    if profile is None or user is None:
        raise NotFound("Nurse not found")
    return {
        "name": user.name, "unmc_number": profile.unmc_number, "unmc_category": profile.unmc_category,
        "unmc_licence_expiry": _expiry(profile.unmc_licence_expiry),
        "unmc_verified": bool(profile.unmc_verified_by),
    }


async def org_values() -> dict[str, Any]:
    v = await care_values()
    return {
        "name": "Bloomwell Home Care Uganda Limited", "short_name": "Bloomwell", "city": "Kampala",
        "phone": v.get("care_forms.org_phone", ""), "privacy_email": v.get("care_forms.privacy_email", ""),
        "pdpo_ref": v.get("care_forms.pdpo_ref", ""),
        "mark_svg": MARK_SVG.replace("<svg ", '<svg width="14mm" height="15.5mm" ', 1),
    }


async def latest_completed_agreement(agreement_id: str | None) -> Agreement | None:
    """The linked agreement, or the newest completed variation that descends from it."""
    if not agreement_id:
        return None
    try:
        current = await Agreement.get(PydanticObjectId(agreement_id))
    except Exception:  # noqa: BLE001
        return None
    best = current if current and current.status == "completed" else None
    seen = {agreement_id}
    frontier = [current.id] if current else []
    while frontier:
        kids = await Agreement.find({"parent_agreement_id": {"$in": frontier}, "status": "completed"}).to_list()
        kids = [k for k in kids if str(k.id) not in seen]
        for k in kids:
            seen.add(str(k.id))
            if best is None or (k.completed_at or k.created_at) > (best.completed_at or best.created_at):
                best = k
        frontier = [k.id for k in kids]
    return best


async def patient_for(client: CareClient) -> dict[str, Any]:
    agreement = await latest_completed_agreement(client.agreement_id)
    if agreement is None:
        return {"name": client.display_name, "type": client.patient_type, "record_id": client.id, **(client.patient_overrides or {})}
    patient = patient_from_agreement({"id": client.id, "display_name": client.display_name}, agreement, client.patient_type, client.patient_overrides or {})
    patient["_client_email"] = _client_email(agreement)
    return patient


def _client_email(agreement: Agreement) -> str:
    f = agreement.fields.get("client__email")
    return str(f.value).strip() if f and f.value else ""


async def assigned_client(client_id: str, nurse_id: str) -> CareClient:
    client = await CareClient.find_one(CareClient.id == client_id)
    if client is None or nurse_id not in client.assigned_nurse_ids:
        raise NotFound("Client not found")
    return client


async def load_instance(instance_id: str, nurse_id: str | None = None) -> CareFormInstance:
    try:
        inst = await CareFormInstance.get(PydanticObjectId(instance_id))
    except Exception:  # noqa: BLE001
        inst = None
    if inst is None or (nurse_id and inst.nurse_id != nurse_id):
        raise NotFound("Form not found")
    return inst


# ----------------------------------------------------------------------------- drafts

async def save_draft(nurse_id: str, form_id: str, client_id: str, visit_id: str | None, data: dict[str, Any]) -> CareFormInstance:
    if form_id not in rules.FORM_IDS and form_id != "tracker":
        raise ValidationFailed("Unknown form", {"form_id": "unknown"})
    client = await assigned_client(client_id, nurse_id)
    if form_id == "tracker" and not rules.tracker_allowed(client.patient_type):
        raise ValidationFailed("Daily trackers are only for patients set as Mama or Baby by admin.", {"form_id": "tracker_not_allowed"})
    if form_id == "08":  # orders are set by supervisors; nurses record Given / Not given and a reason only
        try:
            if set(data) - {"administrations", "_correction_note"}:
                raise rules.RuleError("orders_read_only", "Orders are set by supervisors.")
            for entry in data.get("administrations", []):
                rules.form_08_nurse_patch({k: v for k, v in entry.items() if k not in ("order_id", "at", "due", "dose_route", "initials", "code")})
        except rules.RuleError as exc:
            raise ValidationFailed(str(exc), {exc.code: "invalid"}) from exc
    q = [CareFormInstance.client_id == client_id, CareFormInstance.form_id == form_id, CareFormInstance.visit_id == visit_id, CareFormInstance.superseded == False]  # noqa: E712
    if form_id == "tracker":  # one tracker per client per week
        q.append(CareFormInstance.data["week_start"] == data.get("week_start"))
    existing = await CareFormInstance.find(*q).sort("-version").first_or_none()
    if existing and existing.status != "signed":
        existing.data = {**existing.data, **data} if form_id == "08" else data  # 08 keeps the supervisor's orders
        await existing.save()
        return existing
    if existing:  # corrections add a dated note and a new version; the signed one stays on file
        note = str(data.get("_correction_note", "")).strip()
        if not note:
            raise ValidationFailed("Add a correction note to change a signed form.", {"_correction_note": "required"})
        data = {**data, "_correction_date": datetime.now(UTC).isoformat()}
        existing.superseded = True
        await existing.save()
    inst = CareFormInstance(form_id=form_id, client_id=client_id, visit_id=visit_id, nurse_id=nurse_id, data=data, version=(existing.version + 1) if existing else 1)
    await inst.insert()
    return inst


# ----------------------------------------------------------------------------- rendering

def _sig_view(rows: list[CareFormSignature]) -> dict[str, dict[str, Any]]:
    view: dict[str, dict[str, Any]] = {r: {} for r in ("client", "interpreter", "witness", "nurse", "staff", "receiver")}
    for s in rows:
        role = "client" if s.role in ("client", "representative") else s.role
        detail = s.detail.get("text") or "; ".join(f"{k}: {v}" for k, v in s.detail.items() if k != "interpreter_signed" and v)
        view[role] = {
            "name": s.name, "detail": s.registration_line if s.role == "nurse" else detail, "method": s.method,
            "image": s.evidence.get("image", ""), "esign": s.esign_consent, "at": s.signed_at.strftime("%d %b %Y %H:%M"),
            "evidence": f"{s.method} · {s.signed_at.strftime('%Y-%m-%d %H:%M UTC')} · doc {s.document_hash[:12]}",
        }
    return view


async def _context_for(inst: CareFormInstance, *, with_signatures: bool) -> tuple[str, dict[str, Any]]:
    client = await CareClient.find_one(CareClient.id == inst.client_id)
    if client is None:
        raise NotFound("Client not found")
    patient = await patient_for(client)
    author = await author_for(inst.nurse_id)
    org = await org_values()
    sigs = await CareFormSignature.find(CareFormSignature.instance_id == str(inst.id)).to_list() if with_signatures else []
    nurse_sig = next((s for s in sigs if s.role == "nurse"), None)
    stored = nurse_sig.registration_line if nurse_sig else None
    if stored:  # signed: print the stored UNMC line; a later profile edit or expiry must not break or change old PDFs
        author = {**author, "unmc_number": author["unmc_number"] or "-", "unmc_licence_expiry": None}
    try:
        if inst.form_id == "tracker":
            kind = patient.get("type", "").lower()
            week = date.fromisoformat(inst.data["week_start"])
            entries = [{**e, "date": date.fromisoformat(e["date"])} for e in inst.data.get("entries", [])]
            care = {date.fromisoformat(d): v for d, v in (inst.data.get("care") or {}).items()}
            notes = [{"date": date.fromisoformat(n["date"]), "text": n["text"]} for n in inst.data.get("notes", []) if n.get("text")]
            ctx = tracker_context(kind, week, patient=patient, partner=inst.data.get("partner", {}), author=author, org=org, entries=entries, care=care, notes=notes)
            template = template_for("tracker", patient.get("type"))
        else:
            values = rules.form_08_values(inst.data) if inst.form_id == "08" else inst.data
            ctx = build_context(inst.form_id, patient=patient, author=author, org=org, values=values, form=inst.data.get("_form", {}), signatures=_sig_view(sigs) if sigs else None)
            template = template_for(inst.form_id)
    except MissingProfileField as exc:
        raise AppError("open_profile", str(exc), 403) from exc
    if stored:
        ctx["author"]["registration_line"] = stored
    return template, ctx


async def render_instance_pdf(inst: CareFormInstance) -> bytes:
    template, ctx = await _context_for(inst, with_signatures=True)
    pdf, _ = render_pdf(template, ctx)
    return pdf


# ----------------------------------------------------------------------------- signing

def _image(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith("data:image/png;base64,") or len(value) > MAX_IMAGE_CHARS:
        raise ValidationFailed("Signature image must be a PNG under 200 KB.", {"image": "invalid"})
    return value


async def add_client_signature(inst: CareFormInstance, *, role: str, method: str, name: str, detail: dict[str, Any], evidence: dict[str, Any], image: str | None, esign_consent: bool, signer_email: str | None) -> CareFormInstance:
    if inst.status == "signed":
        raise Conflict("This form is already signed. Add a correction instead.")
    if not rules.needs_client_signature(inst.form_id) and inst.form_id not in rules.OPTIONAL_CLIENT_FORMS:
        raise ValidationFailed("This form is signed by the nurse only.", {"form_id": "nurse_only"})
    img = _image(image)
    try:
        rules.validate_client_signature(role, method, esign_consent=esign_consent, name=name, detail=detail, evidence=evidence, has_image=bool(img))
    except rules.RuleError as exc:
        raise ValidationFailed(str(exc), {exc.code: "invalid"}) from exc
    template, ctx = await _context_for(inst, with_signatures=False)
    doc_hash = content_hash(render_html(template, ctx))
    ev = {**evidence, **({"image": img} if img else {})}
    await CareFormSignature(instance_id=str(inst.id), role=role, name=name.strip(), detail=detail, method=method, evidence=ev, signer_email=(signer_email or "").strip() or None, esign_consent=esign_consent, document_hash=doc_hash).insert()
    inst.status = "pending"
    inst.document_hash = doc_hash
    await inst.save()
    return inst


async def countersign(inst: CareFormInstance, *, method: str, evidence: dict[str, Any], image: str | None) -> tuple[CareFormInstance, CareFormSignature]:
    if inst.status == "signed":
        raise Conflict("This form is already signed.")
    sigs = await CareFormSignature.find(CareFormSignature.instance_id == str(inst.id)).to_list()
    if rules.needs_client_signature(inst.form_id) and not any(s.role in ("client", "representative") for s in sigs):
        raise Conflict("The client must sign first. Never pre-sign.")
    img = _image(image)
    try:
        rules.validate_nurse_signature(method, evidence=evidence, has_image=bool(img))
        author = await author_for(inst.nurse_id)
        line = registration_line(author)
    except rules.RuleError as exc:
        raise ValidationFailed(str(exc), {exc.code: "invalid"}) from exc
    except MissingProfileField as exc:
        raise AppError("open_profile", str(exc), 403) from exc  # the app turns this code into a Profile prompt
    template, ctx = await _context_for(inst, with_signatures=False)
    doc_hash = inst.document_hash or content_hash(render_html(template, ctx))
    row = CareFormSignature(instance_id=str(inst.id), role="nurse", name=author["name"], method=method, evidence={**evidence, **({"image": img} if img else {})}, registration_line=line, document_hash=doc_hash)
    await row.insert()
    inst.status, inst.document_hash, inst.signed_at = "signed", doc_hash, datetime.now(UTC)
    await inst.save()
    return inst, row


# ----------------------------------------------------------------------------- gates (enforced in field.service.record_event)

async def _gates_on() -> bool:
    return bool((await care_values()).get("care_forms.gates_enabled", False))


async def arrive_blocked(client_id: str) -> bool:
    if not await _gates_on():
        return False
    signed = {i.form_id for i in await CareFormInstance.find(CareFormInstance.client_id == client_id, CareFormInstance.status == "signed", CareFormInstance.superseded == False).to_list()}  # noqa: E712
    return rules.arrive_blocked(signed)


async def visit_sign_blocked(visit_id: str, client_id: str) -> bool:
    if not await _gates_on():
        return False
    rows = await CareFormInstance.find(CareFormInstance.visit_id == visit_id, CareFormInstance.superseded == False).to_list()  # noqa: E712
    trackers = await CareFormInstance.find(CareFormInstance.client_id == client_id, CareFormInstance.form_id == "tracker", CareFormInstance.superseded == False).to_list()  # noqa: E712
    entries: list[dict[str, Any]] = []
    for r in rows + trackers:
        if r.form_id == "tracker":  # the app stamps each entry with the visit it was taken on
            entries += [{"temp": e.get("values", {}).get("temp"), "action": e.get("action", "")} for e in r.data.get("entries", []) if e.get("visit_id") == visit_id]
        elif r.data.get("temperature_c") not in (None, ""):
            entries.append({"temp": r.data.get("temperature_c"), "action": r.data.get("temperature_action", "")})
    client = await CareClient.find_one(CareClient.id == client_id)
    return rules.visit_sign_blocked(entries, has_form_10=any(r.form_id == "10" for r in rows), baby=bool(client and client.patient_type == "Baby"))


# ----------------------------------------------------------------------------- client copy (rule 7)

async def send_copy(inst: CareFormInstance, *, force: bool = False) -> str:
    """Emails the sealed PDF when the admin switch is on and the client agreed. Returns sent | skipped | failed. Never raises."""
    try:
        values = await care_values()
        sigs = await CareFormSignature.find(CareFormSignature.instance_id == str(inst.id)).to_list()
        signer = next((s for s in sigs if s.role in ("client", "representative")), None)
        client = await CareClient.find_one(CareClient.id == inst.client_id)
        patient = await patient_for(client) if client else {}
        consented = bool(inst.data.get("client_agreed_email") or (inst.data.get("_form", {}) or {}).get("client_agreed_email"))
        to = rules.copy_recipient(auto_on=bool(values.get("care_forms.auto_email_copy", False)), client_consented=consented, signer_role=signer.role if signer else "", signer_email=signer.signer_email if signer else None, client_email=patient.get("_client_email") or patient.get("email"))
        if not to:
            await CareFormCopyLog(instance_id=str(inst.id), client_id=inst.client_id, status="skipped", reason="switch_off_or_no_consent_or_no_address").insert()
            return "skipped"
        from app.modules.notifications.providers import get_email_provider

        pdf = await render_instance_pdf(inst)
        result = await get_email_provider().send([to], rules.COPY_SUBJECT, rules.COPY_HTML, rules.COPY_PLAIN, attachments=[{"filename": f"bloomwell-form-{inst.form_id}.pdf", "content_type": "application/pdf", "data": pdf}])
        ok = bool(result.ok and getattr(result, "provider_message_id", None) != "console")
        await CareFormCopyLog(instance_id=str(inst.id), client_id=inst.client_id, status="sent" if ok else "failed", reason=None if ok else "mail_not_accepted", recipient_hint="email").insert()
        return "sent" if ok else "failed"
    except Exception:  # noqa: BLE001 - a failed copy must never block signing; it shows on Sync / the admin log
        log.exception("care form copy failed for %s", inst.id)
        await CareFormCopyLog(instance_id=str(inst.id), client_id=inst.client_id, status="failed", reason="error").insert()
        return "failed"


# ----------------------------------------------------------------------------- one-shot submit (offline outbox)

async def verify_account_password(user_id: str, password: str) -> bool:
    from app.core.security import verify_password

    try:
        user = await User.get(PydanticObjectId(user_id))
    except Exception:  # noqa: BLE001
        return False
    return bool(user and password and verify_password(password, user.password_hash))


async def submit(nurse_id: str, *, op_id: str, form_id: str, client_id: str, visit_id: str | None, data: dict[str, Any],
                 client_sig: dict[str, Any] | None, nurse_sig: dict[str, Any] | None) -> tuple[CareFormInstance, str]:
    """Draft -> optional client signature -> optional countersign in one call. Idempotent per op_id."""
    done = await CareFormInstance.find_one(CareFormInstance.op_id == op_id, CareFormInstance.nurse_id == nurse_id)
    if done:
        return done, "skipped"
    inst = await save_draft(nurse_id, form_id, client_id, visit_id, data)
    inst.op_id = op_id
    await inst.save()
    if client_sig:
        inst = await add_client_signature(inst, **client_sig)
    copy = "skipped"
    if nurse_sig:
        evidence = dict(nurse_sig.get("evidence") or {})
        if nurse_sig.get("method") == "password":
            if not await verify_account_password(nurse_id, str(evidence.pop("password", ""))):
                raise AppError("bad_password", "Account password not recognised.", 403)
            evidence = {"verified": True, "at": datetime.now(UTC).isoformat()}
        inst, _ = await countersign(inst, method=nurse_sig["method"], evidence=evidence, image=nurse_sig.get("image"))
        if rules.needs_client_signature(form_id) or form_id in rules.OPTIONAL_CLIENT_FORMS:
            copy = await send_copy(inst)
    return inst, copy


async def bootstrap(nurse_id: str) -> dict[str, Any]:
    """Everything the nurse app caches to work offline: switches, patient types and signed form ids per client."""
    values = await care_values()
    clients = await CareClient.find({"assigned_nurse_ids": nurse_id}).to_list()
    rows = await CareFormInstance.find(CareFormInstance.nurse_id == nurse_id, CareFormInstance.superseded == False).to_list()  # noqa: E712
    return {
        "auto_email_copy": bool(values.get("care_forms.auto_email_copy", False)),
        "gates_enabled": bool(values.get("care_forms.gates_enabled", False)),
        "privacy_email": values.get("care_forms.privacy_email", ""),
        "clients": [{"id": c.id, "display_name": c.display_name, "patient_type": c.patient_type} for c in clients],
        "documents": [{"id": str(r.id), "form_id": r.form_id, "client_id": r.client_id, "visit_id": r.visit_id, "status": r.status, "version": r.version,
                       "signed_at": r.signed_at, "updated_at": r.updated_at, "data": r.data if r.form_id == "tracker" or r.status != "signed" else {}} for r in rows],
    }


async def set_form_08_order(client_id: str, nurse_id: str, order: dict[str, Any]) -> CareFormInstance:
    """Supervisor/admin sets the verified medicine order. Nurses can only record Given / Not given against it."""
    client = await assigned_client(client_id, nurse_id)
    inst = await CareFormInstance.find_one(CareFormInstance.client_id == client.id, CareFormInstance.form_id == "08", CareFormInstance.status != "signed", CareFormInstance.superseded == False)  # noqa: E712
    if inst is None:
        inst = CareFormInstance(form_id="08", client_id=client.id, nurse_id=nurse_id, data={"orders": order})
        await inst.insert()
    else:
        inst.data = {**inst.data, "orders": order}
        await inst.save()
    return inst
