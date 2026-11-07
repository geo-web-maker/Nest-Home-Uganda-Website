from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import httpx
from beanie import PydanticObjectId

from app.core import db
from app.core.config import get_settings
from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.phone import is_mobile, mask, normalise_e164, normalise_phone
from app.core.rate_limit import limiter
from app.core.security import hash_ip, verify_password
from app.core.storage import Bucket, get_storage
from app.modules.agreements import credentials, messages, render, rules
from app.modules.agreements import repository
from app.modules.agreements.models import (
    Agreement, AgreementEvent, AgreementField, AgreementMessageTemplate,
    AgreementOtp, AgreementSignature, AgreementTemplate, IMAGE_SIGNATURE_METHODS,
)
from app.modules.agreements.schemas import (
    AgreementCreate, FieldPatch, MessageTemplatePatch, SendAgreement, TemplateDraft,
)
from app.modules.audit import service as audit
from app.modules.auth.models import User
from app.modules.notifications.config import load_config
from app.modules.notifications.providers import get_email_provider, get_sms_provider
from app.modules.notifications.service import send_sms

log = logging.getLogger("app.agreements")
COMPANY = "Bloomwell Home Care Uganda Limited"
OPEN_STATUSES = {"draft", "sent", "client_in_progress", "client_signed", "changes_requested"}
OTP_TTL = timedelta(minutes=10)
OTP_LOCK = timedelta(minutes=15)
SESSION_TTL = 60 * 60
MAX_SIGNATURE_BYTES = 1_000_000

# Context-local capture used only by the protected diagnostic workflow. It prevents
# synthetic messages from ever being delivered to clients while exercising real services.
_DIAGNOSTIC_CAPTURE: ContextVar[dict[str, Any] | None] = ContextVar("agreement_diagnostic_capture", default=None)


def _oid(value: str) -> PydanticObjectId | None:
    return PydanticObjectId(value) if PydanticObjectId.is_valid(value) else None


def _secret() -> bytes:
    cfg = get_settings()
    secret = cfg.nest_mail_secret_key or cfg.secret_key
    if len(secret) < 32:
        raise RuntimeError("A strong application secret is required for agreement tokens")
    return hashlib.sha256((secret + ":agreement-v1").encode()).digest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _otp_hash(agreement_id: str, purpose: str, code: str) -> str:
    return hmac.new(_secret(), f"{agreement_id}:{purpose}:{code}".encode(), hashlib.sha256).hexdigest()


def _session_token(agreement_id: str, purpose: str, expires: int, session_version: int) -> str:
    payload = f"{agreement_id}:{purpose}:{expires}:{session_version}:{secrets.token_urlsafe(12)}"
    signature = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def verify_session_token(token: str | None) -> tuple[str, str, int] | None:
    if not token:
        return None
    try:
        agreement_id, purpose, expires, session_version, nonce, signature = token.split(":", 5)
        payload = f"{agreement_id}:{purpose}:{expires}:{session_version}:{nonce}"
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(expires) <= int(datetime.now(UTC).timestamp()):
            return None
        if purpose not in {"sign", "view"} or not PydanticObjectId.is_valid(agreement_id):
            return None
        return agreement_id, purpose, int(session_version)
    except Exception:
        return None


def session_cookie(token: str, response) -> None:
    cfg = get_settings()
    response.set_cookie(
        "agreement_session", token, max_age=SESSION_TTL, httponly=True,
        secure=cfg.cookie_secure, samesite="lax", path="/api/v1/public/agreements",
    )


def _event(doc: Agreement, kind: str, actor: str, detail: dict[str, Any] | None = None,
           ip_hash: str | None = None) -> None:
    doc.events.append(AgreementEvent(type=kind, actor=actor, detail=detail or {}, ip_hash=ip_hash))


def diagnostic_capture() -> dict[str, Any] | None:
    """Return the active request-local diagnostics capture, if this is a test run."""
    return _DIAGNOSTIC_CAPTURE.get()


async def current_template() -> AgreementTemplate | None:
    return await AgreementTemplate.find_one(AgreementTemplate.is_published == True,
                                            sort=[("version", -1)])  # noqa: E712


def _real_phone(doc: Agreement) -> str | None:
    """The client's phone value, or None when blank or marked N/A."""
    field = doc.fields.get(rules.field_key("client.phone"))
    value = field.value if field else None
    return value if value and str(value).strip().upper() != "N/A" else None


def _validate_ready(doc: Agreement, template: AgreementTemplate | None) -> None:
    if template is None or not template.clauses:
        raise Conflict("The agreement clause text has not been published. Add the source agreement wording before sending.")
    required = ("client.name", "patient.full_name", "schedule_b.total_fee", "schedule_b.currency")
    missing = [path for path in required if not doc.fields.get(rules.field_key(path)) or doc.fields[rules.field_key(path)].value in (None, "", [])]
    missing.extend(rules.missing_staff_fields(doc.fields))
    if not _real_phone(doc) and not (doc.fields.get(rules.field_key("client.email")) and doc.fields[rules.field_key("client.email")].value):
        missing.append("client.phone or client.email")
    if missing:
        raise ValidationFailed("Complete the required agreement fields before sending.", {path: "required" for path in missing})
    if "1.1" not in template.clauses or "14.1" not in template.clauses:
        raise Conflict("Template v1 must include corrected clauses 1.1 and 14.1 before it can be sent.")


async def _channel_delivery_readiness(channel: Literal["email", "sms"], recipient: Any) -> tuple[bool, str]:
    """Fail closed when a channel is configured to log to console instead of delivering.

    The mail/SMS legacy adapters intentionally have console fallbacks for non-critical
    application notices. An agreement link or OTP must never report success through
    those fallbacks, because that would leave a client unable to complete the contract.
    """
    if channel == "email":
        address = str(recipient or "").strip()
        if len(address) > 254 or "@" not in address or address.startswith("@") or address.endswith("@"):
            return False, "The agreement has no valid email address for the selected channel."
        try:
            from app.modules.mail.settings_service import get_value

            enabled = bool(await get_value("mail.enabled"))
            external = bool(await get_value("mail.external_enabled"))
            suspended = bool(await get_value("mail.suspend_all_sending"))
            provider = str(await get_value("mail.provider") or "console").strip().lower()
            domain = str(await get_value("mail.domain") or "").strip().lower()
            if not enabled:
                return False, "Mail is disabled. Enable and configure external mail in the Mail section."
            if not external or suspended:
                return False, "External email sending is disabled or globally suspended in the Mail section."
            if provider not in {"resend", "brevo"}:
                return False, "The console mail provider does not deliver email. Select Resend or Brevo."
            if domain != "bhcug.com":
                return False, "The configured sender domain must be bhcug.com before customer agreements can be sent."
            if provider == "brevo" and str(await get_value("mail.brevo_transport") or "smtp").lower() == "smtp":
                username = str(await get_value("mail.smtp_username") or "").strip()
                password = str(await get_value("mail.smtp_password") or "").strip()
                if not username or not password:
                    return False, "Brevo SMTP username/password are missing in Mail settings."
            else:
                api_key = str(await get_value("mail.provider_api_key") or "").strip()
                if not api_key:
                    return False, f"The {provider.title()} API key is missing in Mail settings."
        except Exception as exc:
            log.warning("agreement email preflight failed (%s)", type(exc).__name__)
            return False, "Mail configuration could not be verified. Check the Mail settings and diagnostics."
        return True, "Email is configured for external delivery."

    phone = normalise_e164(str(recipient or ""))
    if not phone or not is_mobile(phone):
        return False, "The agreement has no valid Uganda mobile number for the selected channel."
    settings = get_settings()
    if str(settings.sms_provider or "console").lower() != "mambosms":
        return False, "The console SMS provider only logs messages. Configure MamboSMS before customer sends."
    if not settings.mambosms_api_key:
        return False, "MamboSMS is selected but MAMBOSMS_API_KEY is missing."
    try:
        config = await load_config()
    except Exception as exc:
        log.warning("agreement SMS preflight failed (%s)", type(exc).__name__)
        return False, "SMS configuration could not be loaded. Check Notifications settings."
    sender = str(config.sender_id or "").strip()
    if not sender or len(sender) > 11:
        return False, "Configure a valid MamboSMS sender ID (1–11 characters)."
    return True, "MamboSMS is configured for external delivery."


async def _assert_customer_delivery_ready(doc: Agreement, channels: Literal["email", "sms", "both"]) -> None:
    if _DIAGNOSTIC_CAPTURE.get() is not None:
        return
    destinations = {
        "email": doc.fields.get(rules.field_key("client.email")).value if doc.fields.get(rules.field_key("client.email")) else None,
        "sms": _real_phone(doc),
    }
    selected = ("email", "sms") if channels == "both" else (channels,)
    failures: list[str] = []
    for channel in selected:
        ready, reason = await _channel_delivery_readiness(channel, destinations[channel])
        if not ready:
            failures.append(f"{channel}: {reason}")
    if failures:
        raise ValidationFailed(
            "This agreement has not been sent. Fix the selected delivery channel(s) first.",
            {"delivery": " ".join(failures)},
        )


async def create(principal: Principal, body: AgreementCreate, ip: str | None = None) -> Agreement:
    year = datetime.now(UTC).year
    reference = await repository.next_reference(year)
    template = await current_template()
    fields = rules.initial_fields()
    enquiry_id = _oid(body.enquiry_id) if body.enquiry_id else None
    if body.enquiry_id and enquiry_id is None:
        raise ValidationFailed("The enquiry reference is invalid.", {"enquiry_id": "invalid"})
    if enquiry_id:
        from app.modules.enquiries.models import Enquiry
        enquiry = await Enquiry.get(enquiry_id)
        if enquiry is None:
            raise NotFound("Enquiry not found")
        prefill = {
            "client.name": enquiry.name,
            "client.phone": enquiry.phone_raw,
            "client.email": enquiry.email,
            "client.relationship_to_patient": enquiry.relationship,
        }
        for path, value in prefill.items():
            if value not in (None, ""):
                key = rules.field_key(path)
                fields[key] = fields[key].model_copy(update={"value": value, "revision": 1,
                    "updated_by": principal.user_id, "updated_at": datetime.now(UTC)})
    nurse_id = _oid(body.assigned_nurse_id) if body.assigned_nurse_id else None
    if body.assigned_nurse_id and nurse_id is None:
        raise ValidationFailed("The assigned nurse reference is invalid.", {"assigned_nurse_id": "invalid"})
    doc = Agreement(
        reference=reference, created_by=_oid(principal.user_id), enquiry_id=enquiry_id,
        assigned_nurse_id=nurse_id, fields=fields,
        template_version=template.version if template else 0,
        template_hash=template.template_hash if template else "",
        schedule_b_computed=rules.calculate_fees(0),
    )
    _event(doc, "created", principal.user_id, {"enquiry_id": str(enquiry_id) if enquiry_id else None}, ip)
    await doc.insert()
    await audit.record(principal, "agreement.created", "agreement", str(doc.id), reference,
                       after={"status": "draft", "reference": reference}, ip_hash=ip)
    return doc


async def get_agreement(agreement_id: str) -> Agreement:
    oid = _oid(agreement_id)
    doc = await Agreement.get(oid) if oid else None
    if doc is None:
        raise NotFound("Agreement not found")
    await _backfill_registry_fields(doc)
    return doc


async def _backfill_registry_fields(doc: Agreement) -> None:
    """Give a draft any registry field it was created without.

    Agreements drafted before a field was added to the registry never stored it, so the
    editor could not show it while the send check still demanded it. Only drafts are
    touched: a sent or signed agreement's fields feed its canonical hash and must not change.
    """
    if doc.status != "draft":
        return
    missing = {key: field for key, field in rules.initial_fields().items() if key not in doc.fields}
    if missing:
        doc.fields.update(missing)
        await doc.save()


async def list_agreements(*, status: str | None = None, q: str | None = None,
                          assigned_nurse_id: str | None = None, limit: int = 50,
                          skip: int = 0) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if status:
        if status not in {"draft", "sent", "client_in_progress", "client_signed", "completed", "changes_requested", "expired", "voided"}:
            raise ValidationFailed("Unknown agreement status", {"status": "invalid"})
        query["status"] = status
    nurse = _oid(assigned_nurse_id) if assigned_nurse_id else None
    if assigned_nurse_id and nurse is None:
        raise ValidationFailed("The nurse id is invalid", {"assigned_nurse_id": "invalid"})
    if nurse:
        query["assigned_nurse_id"] = nurse
    cursor = Agreement.find(query).sort("-created_at")
    total = await cursor.count()
    docs = await cursor.skip(skip).limit(min(max(limit, 1), 100)).to_list()
    needle = (q or "").strip().lower()
    if needle:
        docs = [d for d in docs if needle in d.reference.lower() or needle in str((d.fields.get(rules.field_key("client.name")).value if d.fields.get(rules.field_key("client.name")) else "")).lower()]
        # Searching is post-filtered only when no other list filters are used. Counts remain conservative.
        total = len(docs)
    return {
        "items": [agreement_summary(d) for d in docs],
        "total": total, "skip": skip, "limit": min(max(limit, 1), 100),
    }


def agreement_summary(doc: Agreement) -> dict[str, Any]:
    def val(path: str):
        field = doc.fields.get(rules.field_key(path))
        return field.value if field else None
    return {
        "id": str(doc.id), "reference": doc.reference, "status": doc.status,
        "client_name": val("client.name"), "patient_name": val("patient.full_name"),
        "client_email": val("client.email"), "client_phone": val("client.phone"),
        "assigned_nurse_id": str(doc.assigned_nurse_id) if doc.assigned_nurse_id else None,
        "created_at": doc.created_at, "updated_at": doc.updated_at,
        "expires_at": doc.expires_at,
    }


def agreement_detail(doc: Agreement) -> dict[str, Any]:
    return {
        **agreement_summary(doc),
        "template_version": doc.template_version,
        "template_hash": doc.template_hash,
        "fields": {rules.field_path(key): value.model_dump(mode="json") for key, value in doc.fields.items()},
        "schedule_b_computed": doc.schedule_b_computed,
        "events": [event.model_dump(mode="json") for event in doc.events],
        "signatures": [sig.model_dump(mode="json", exclude={"image_key", "verification"}) for sig in doc.signatures],
        "sealed": {"sealed_at": doc.sealed.get("sealed_at"), "pdf_sha256": doc.sealed.get("pdf_sha256")},
    }


async def _send_message(doc: Agreement, stage: str, channel: Literal["email", "sms"], *, link: str = "",
                        code: str = "", expires_days: int = 14, reason: str = "", recipient: str | None = None) -> bool:
    template, version, _ = await messages.get_template(stage, channel)
    variables = messages.message_variables(
        doc, link=link, code=code, expires_days=expires_days,
        expires_date=doc.expires_at.date().isoformat() if doc.expires_at else "",
        reason=reason,
    )
    text_template = template.body
    rendered = messages.render_variables(text_template, variables)
    messages.validate_template(stage, channel, {
        "subject": template.subject, "preheader": template.preheader,
        "body": template.body, "button": template.button, "footer_note": template.footer_note,
    })
    capture = _DIAGNOSTIC_CAPTURE.get()
    if capture is not None:
        if channel == "sms":
            messages.validate_rendered_sms(rendered)
        else:
            subject, body_html, plain = messages.render_email(stage, template, variables)
            if not subject or not body_html or not plain:
                raise ValueError("Rendered agreement email is incomplete")
        capture.setdefault("messages", []).append({"stage": stage, "channel": channel})
        _event(doc, "diagnostic_message_rendered", "diagnostics", {"stage": stage, "channel": channel})
        await doc.save()
        return True
    if channel == "sms":
        to = recipient or (doc.fields.get(rules.field_key("client.phone")).value if doc.fields.get(rules.field_key("client.phone")) else None)
        phone = normalise_e164(str(to or ""))
        if not phone or not is_mobile(phone):
            return False
        ready, _reason = await _channel_delivery_readiness("sms", phone)
        if not ready:
            ok = False
        else:
            try:
                messages.validate_rendered_sms(rendered)
            except ValueError:
                ok = False
            else:
                config = await load_config()
                provider = get_sms_provider()
                # A console provider reports success while only logging a masked message.
                ok = getattr(provider, "name", "console") == "mambosms" and await send_sms(
                    provider, config, to=phone, text=rendered, audience="agreement_client",
                    template=f"agreement_{stage}", enquiry=None,
                )
    else:
        to = recipient or (doc.fields.get(rules.field_key("client.email")).value if doc.fields.get(rules.field_key("client.email")) else None)
        if not isinstance(to, str) or "@" not in to:
            return False
        subject, body_html, plain = messages.render_email(stage, template, variables)
        ready, _reason = await _channel_delivery_readiness("email", to)
        if not ready:
            ok = False
        else:
            result = await get_email_provider().send([to], subject, body_html, plain)
            # SystemMailOutboxAdapter intentionally falls back to a console log on
            # infrastructure errors. That is not delivery and must count as failure.
            ok = bool(result.ok and getattr(result, "provider_message_id", None) != "console")
    _event(doc, "message_sent" if ok else "message_failed", "system", {
        "stage": stage, "channel": channel, "template_version": version,
        "recipient_hint": mask(str(to)) if channel == "sms" and to else ("email" if to else None),
    })
    await doc.save()
    return ok


async def send(doc: Agreement, principal: Principal, body: SendAgreement, ip: str | None = None) -> dict[str, Any]:
    if doc.status not in {"draft", "changes_requested", "expired"}:
        raise Conflict("Only a draft or returned agreement can be sent")
    template = await current_template()
    _validate_ready(doc, template)
    await _assert_customer_delivery_ready(doc, body.channels)
    if template:
        doc.template_version, doc.template_hash = template.version, template.template_hash
    raw_token = secrets.token_urlsafe(32)
    capture = _DIAGNOSTIC_CAPTURE.get()
    if capture is not None:
        capture["review_token"] = raw_token
    now = datetime.now(UTC)
    doc.token_hash = _token_hash(raw_token)
    doc.session_version += 1
    doc.view_token_hash = None
    doc.token_issued_at = now
    doc.token_expires_at = now + timedelta(days=body.expires_days)
    doc.expires_at = doc.token_expires_at
    doc.channel_preference = body.channels
    doc.status = "sent"
    _event(doc, "send_attempted", principal.user_id, {"channels": body.channels, "expires_days": body.expires_days}, ip)
    await doc.save()
    link = messages.public_link(raw_token)
    results = {}
    message_stage = "amendment_sent" if doc.parent_agreement_id else "agreement_sent"
    if body.channels in {"email", "both"}:
        results["email"] = await _send_message(doc, message_stage, "email", link=link, expires_days=body.expires_days)
    if body.channels in {"sms", "both"}:
        results["sms"] = await _send_message(doc, message_stage, "sms", link=link, expires_days=body.expires_days)
    successful = [channel for channel, ok in results.items() if ok]
    if successful:
        _event(doc, "sent" if len(successful) == len(results) else "delivery_partial", "system",
               {"requested_channels": list(results), "successful_channels": successful})
    else:
        # Do not leave a customer-facing sent state when no selected channel actually
        # accepted the message. Any token created for this failed attempt is revoked.
        doc.status = "draft"
        doc.token_hash = None
        doc.token_issued_at = None
        doc.token_expires_at = None
        doc.expires_at = None
        doc.session_version += 1
        _event(doc, "send_delivery_failed", "system", {"requested_channels": list(results)})
    await doc.save()
    await audit.record(principal, "agreement.sent", "agreement", str(doc.id), doc.reference,
                       after={"status": doc.status, "channels": body.channels, "delivery": results}, ip_hash=ip)
    return {"agreement": agreement_detail(doc), "delivery": results}


async def patch_fields(doc: Agreement, changes: list[FieldPatch], *, actor: str,
                       principal: Principal | None = None, ip: str | None = None,
                       user_agent: str | None = None) -> Agreement:
    if doc.status in {"client_signed", "completed", "voided", "expired"}:
        raise Conflict("This agreement is locked. Create an amendment to change a signed agreement.")
    seen: set[str] = set()
    updates: list[tuple[str, Any, AgreementField]] = []
    stale_paths: dict[str, int | None] = {}
    for change in changes:
        if change.path in seen:
            raise ValidationFailed("A field may be changed only once per request", {change.path: "duplicate"})
        seen.add(change.path)
        storage_key = rules.field_key(change.path)
        current = doc.fields.get(storage_key)
        if current is None:
            raise ValidationFailed("Unknown agreement field", {change.path: "unknown"})
        # No per-field locking: the latest save wins and every change is kept in the event history.
        stale_from = change.expected_revision if current.revision != change.expected_revision else None
        expected = rules.FIELD_OWNERS.get(change.path)
        if expected is None or current.owner != expected:
            raise Conflict("Field ownership changed; reload the agreement")
        if actor == "client" and expected not in {"client", "either"}:
            raise Forbidden("This field is read-only for clients")
        if actor == "staff" and expected == "client":
            raise Forbidden("Schedule C consent and permission fields must be completed by the client or lawful representative")
        if change.entered_by_staff and (actor != "staff" or expected != "either"):
            raise Forbidden("Only an 'either' field may be entered by staff on behalf of a client")
        if actor == "client" and change.entered_by_staff:
            raise Forbidden("Clients cannot mark fields as entered by staff")
        value = change.value
        if change.path == "client.phone" and value:
            if str(value).strip().upper() == "N/A":
                value = "N/A"  # a client may have no phone; the send check then needs an email instead
            else:
                normalized = normalise_phone(str(value))
                if not normalized:
                    raise ValidationFailed("Enter a valid phone number with its country code, or N/A", {change.path: "invalid_phone"})
                value = normalized
        if change.path == "client.email" and value:
            value = str(value).strip().lower()
            if len(value) > 254 or "@" not in value:
                raise ValidationFailed("Enter a valid email address", {change.path: "invalid_email"})
        if isinstance(value, str) and len(value) > 12_000:
            raise ValidationFailed("Field value is too long", {change.path: "too_long"})
        updates.append((change.path, value, current))
        stale_paths[change.path] = stale_from
    before: dict[str, Any] = {}
    now = datetime.now(UTC)
    original_status = doc.status
    original_session_version = doc.session_version
    previous_event_count = len(doc.events)
    for path, value, current in updates:
        before[path] = current.value
        storage_key = rules.field_key(path)
        doc.fields[storage_key] = current.model_copy(update={
            "value": value, "revision": current.revision + 1,
            "entered_by_staff": bool(next(c.entered_by_staff for c in changes if c.path == path)),
            "updated_at": now, "updated_by": principal.user_id if principal else "client",
        })
        _event(doc, "field_changed", principal.user_id if principal else "client", {
            "path": path, "old_value": before[path], "new_value": value,
            "revision": doc.fields[storage_key].revision,
            "entered_by_staff": doc.fields[storage_key].entered_by_staff,
            "overwrote_newer_revision": stale_paths.get(path) is not None,
        }, ip)
    fee_paths = {"schedule_b.total_fee", "schedule_b.currency"}
    if seen & fee_paths:
        total_field = doc.fields.get(rules.field_key("schedule_b.total_fee"))
        currency_field = doc.fields.get(rules.field_key("schedule_b.currency"))
        total = total_field.value if total_field else 0
        currency = currency_field.value if currency_field else "UGX"
        if total not in (None, ""):
            try:
                doc.schedule_b_computed = rules.calculate_fees(total, str(currency or "UGX"))
            except ValueError as exc:
                raise ValidationFailed("Check the Schedule B fee and currency", {"schedule_b.total_fee": str(exc)}) from exc
    if actor == "client" and doc.status == "sent":
        doc.status = "client_in_progress"
    was_sent = actor == "staff" and original_status in {"sent", "client_in_progress", "changes_requested"}
    raw_token = None
    if was_sent:
        # A staff revision invalidates the prior link and issues a fresh link for re-review.
        raw_token = secrets.token_urlsafe(32)
        doc.token_hash = _token_hash(raw_token)
        doc.session_version += 1
        doc.token_issued_at = now
        doc.token_expires_at = now + timedelta(days=14)
        doc.expires_at = doc.token_expires_at
        doc.status = "sent"
        _event(doc, "staff_revised", principal.user_id if principal else "staff", {"changed_fields": sorted(seen)}, ip)

    # Optimistic compare-and-set: all changed field revisions, status and session generation
    # must still match in MongoDB. This prevents simultaneous saves from silently overwriting.
    query: dict[str, Any] = {"_id": doc.id, "status": original_status,
                             "session_version": original_session_version}
    set_values: dict[str, Any] = {
        f"fields.{rules.field_key(path)}": doc.fields[rules.field_key(path)].model_dump(mode="python")
        for path, _value, _current in updates
    }
    if seen & fee_paths:
        set_values["schedule_b_computed"] = doc.schedule_b_computed
    set_values.update({
        "status": doc.status, "session_version": doc.session_version,
        "token_hash": doc.token_hash, "token_issued_at": doc.token_issued_at,
        "token_expires_at": doc.token_expires_at, "expires_at": doc.expires_at,
        "updated_at": now,
    })
    new_events = [event.model_dump(mode="python") for event in doc.events[previous_event_count:]]
    update_doc: dict[str, Any] = {"$set": set_values}
    if new_events:
        update_doc["$push"] = {"events": {"$each": new_events}}
    result = await Agreement.get_pymongo_collection().update_one(query, update_doc)
    if result.modified_count != 1:
        raise Conflict("This agreement changed while you were saving. Reload and choose which values to keep.")
    doc.updated_at = now
    if was_sent and raw_token:
        token = raw_token
        delivery: dict[str, bool] = {}
        for channel in ("email", "sms"):
            if channel == "email" and doc.fields.get(rules.field_key("client.email")) and doc.fields[rules.field_key("client.email")].value:
                delivery[channel] = await _send_message(doc, "staff_revised", "email", link=messages.public_link(token))
            if channel == "sms" and _real_phone(doc):
                delivery[channel] = await _send_message(doc, "staff_revised", "sms", link=messages.public_link(token))
        if not any(delivery.values()):
            # A revised agreement cannot remain in `sent` when no current link was
            # actually delivered. The old link remains revoked and the draft awaits
            # a deliberate resend after the channel has been repaired.
            doc.status = "draft"
            doc.token_hash = None
            doc.token_issued_at = None
            doc.token_expires_at = None
            doc.expires_at = None
            doc.session_version += 1
            _event(doc, "staff_revision_delivery_failed", principal.user_id if principal else "staff",
                   {"requested_channels": list(delivery)})
            await doc.save()
        elif not all(delivery.values()):
            _event(doc, "staff_revision_delivery_partial", principal.user_id if principal else "staff",
                   {"requested_channels": list(delivery), "successful_channels": [k for k, v in delivery.items() if v]})
            await doc.save()
    if principal:
        await audit.record(principal, "agreement.fields_updated", "agreement", str(doc.id), doc.reference,
                           before={"changed_fields": sorted(seen)}, after={"changed_fields": sorted(seen), "status": doc.status}, ip_hash=ip)
    return doc


async def _verify_turnstile(token: str | None) -> None:
    if _DIAGNOSTIC_CAPTURE.get() is not None:
        return
    secret = get_settings().turnstile_secret
    if not secret:
        return
    if not token:
        raise Forbidden("Complete the security check before requesting a code")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", data={"secret": secret, "response": token})
            body = response.json()
        if response.status_code != 200 or body.get("success") is not True:
            raise Forbidden("The security check could not be verified")
    except Forbidden:
        raise
    except Exception as exc:
        raise Forbidden("The security check is temporarily unavailable") from exc


async def _deliver_otp(doc: Agreement, purpose: Literal["sign", "view"], channel: Literal["sms", "email"], code: str) -> bool:
    variables = messages.message_variables(doc, code=code)
    template, _, _ = await messages.get_template("otp_sign" if purpose == "sign" else "otp_view", channel)
    messages.validate_template("otp_sign" if purpose == "sign" else "otp_view", channel, {
        "subject": template.subject, "preheader": template.preheader, "body": template.body,
        "button": template.button, "footer_note": template.footer_note,
    })
    capture = _DIAGNOSTIC_CAPTURE.get()
    if capture is not None:
        rendered = messages.render_variables(template.body, variables)
        if channel == "sms":
            messages.validate_rendered_sms(rendered)
        else:
            subject, html_body, plain = messages.render_email("otp_sign" if purpose == "sign" else "otp_view", template, variables)
            if not subject or not html_body or not plain:
                return False
        capture.setdefault("otp_codes", {})[purpose] = code
        capture.setdefault("messages", []).append({"stage": f"otp_{purpose}", "channel": channel})
        return True
    if channel == "sms":
        phone = normalise_e164(str(doc.fields.get(rules.field_key("client.phone")).value or "")) if doc.fields.get(rules.field_key("client.phone")) else None
        if not phone or not is_mobile(phone):
            return False
        ready, _reason = await _channel_delivery_readiness("sms", phone)
        if not ready:
            return False
        config = await load_config()
        rendered = messages.render_variables(template.body, variables)
        try:
            messages.validate_rendered_sms(rendered)
        except ValueError:
            return False
        provider = get_sms_provider()
        return bool(getattr(provider, "name", "console") == "mambosms" and await send_sms(
            provider, config, to=phone, text=rendered, audience="agreement_otp",
            template=f"agreement_otp_{purpose}", enquiry=None,
        ))
    email_addr = doc.fields.get(rules.field_key("client.email")).value if doc.fields.get(rules.field_key("client.email")) else None
    if not email_addr:
        return False
    ready, _reason = await _channel_delivery_readiness("email", email_addr)
    if not ready:
        return False
    subject, body_html, plain = messages.render_email("otp_sign" if purpose == "sign" else "otp_view", template, variables)
    result = await get_email_provider().send([str(email_addr)], subject, body_html, plain)
    return bool(result.ok and getattr(result, "provider_message_id", None) != "console")


async def request_otp(token: str, purpose: Literal["sign", "view"], body, ip: str | None) -> dict[str, str]:
    await _verify_turnstile(body.turnstile_token)
    token_digest = _token_hash(token)
    if purpose == "sign":
        doc = await Agreement.find_one(Agreement.token_hash == token_digest)
    else:
        doc = await Agreement.find_one(Agreement.view_token_hash == token_digest)
    if doc is None or doc.status in {"voided", "expired", "completed"} and purpose == "sign":
        raise NotFound("This agreement link is no longer active")
    if purpose == "view" and doc.status != "completed":
        raise NotFound("This signed agreement is not available")
    expiry = doc.token_expires_at if purpose == "sign" else None
    if purpose == "sign" and (expiry is None or expiry <= datetime.now(UTC)):
        raise NotFound("This agreement link has expired")
    now = datetime.now(UTC)
    recent = await AgreementOtp.find(AgreementOtp.agreement_id == doc.id,
                                     AgreementOtp.purpose == purpose).sort("-created_at").limit(1).to_list()
    if recent and recent[0].locked_until and recent[0].locked_until > now:
        raise Conflict("Too many incorrect codes. Try again in 15 minutes.")
    phone = doc.fields.get(rules.field_key("client.phone")).value if doc.fields.get(rules.field_key("client.phone")) else None
    email_addr = doc.fields.get(rules.field_key("client.email")).value if doc.fields.get(rules.field_key("client.email")) else None
    available = {"sms": bool(phone and is_mobile(normalise_e164(str(phone)) or "")), "email": bool(email_addr)}
    if body.channel:
        channel = body.channel
        if not available.get(channel):
            raise ValidationFailed("The agreement has no verified destination for that channel", {"channel": "unavailable"})
        candidates = [channel]
    else:
        # Prefer SMS only when it can really be delivered. If the SMS provider is
        # unconfigured but email is live, use email rather than trapping the client.
        candidates = [candidate for candidate in ("sms", "email") if available[candidate]]
        channel = candidates[0] if candidates else ""
    if not channel:
        raise ValidationFailed("The agreement has no verified destination for a verification code", {"channel": "unavailable"})
    if _DIAGNOSTIC_CAPTURE.get() is None:
        ready_channel = None
        last_reason = "No configured verification channel is available."
        for candidate in candidates:
            destination = phone if candidate == "sms" else email_addr
            ready, reason = await _channel_delivery_readiness(candidate, destination)
            if ready:
                ready_channel = candidate
                break
            last_reason = reason
        if ready_channel is None:
            raise Conflict(f"Verification code was not sent. {last_reason}")
        channel = ready_channel
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = AgreementOtp(
        agreement_id=doc.id, purpose=purpose, code_hash=_otp_hash(str(doc.id), purpose, code),
        channel=channel, destination_hint=mask(str(phone)) if channel == "sms" else "email address on file",
        expires_at=now + OTP_TTL, requested_ip_hash=hash_ip(ip or "unknown"),
    )
    await otp.insert()
    ok = await _deliver_otp(doc, purpose, channel, code)
    _event(doc, "otp_sent" if ok else "otp_delivery_failed", "client", {"purpose": purpose, "channel": channel}, hash_ip(ip or "unknown"))
    await doc.save()
    if not ok:
        # The code remains stored but delivery failed; invalidate it immediately.
        otp.used_at = now
        await otp.save()
        raise Conflict("We could not send the verification code. Contact Bloomwell on 0787499988.")
    return {"message": "A verification code has been sent to the contact already on your agreement.", "destination_hint": otp.destination_hint}


async def verify_otp(token: str, purpose: Literal["sign", "view"], code: str, ip: str | None) -> tuple[Agreement, str]:
    digest = _token_hash(token)
    doc = await Agreement.find_one(Agreement.token_hash == digest) if purpose == "sign" else await Agreement.find_one(Agreement.view_token_hash == digest)
    if doc is None:
        raise NotFound("This agreement link is no longer active")
    now = datetime.now(UTC)
    if purpose == "sign" and (doc.token_expires_at is None or doc.token_expires_at <= now or doc.status not in {"sent", "client_in_progress"}):
        raise NotFound("This agreement link has expired")
    rows = await AgreementOtp.find(AgreementOtp.agreement_id == doc.id,
                                  AgreementOtp.purpose == purpose,
                                  AgreementOtp.used_at == None).sort("-created_at").limit(1).to_list()  # noqa: E711
    otp = rows[0] if rows else None
    if otp is None or otp.expires_at <= now:
        raise Forbidden("Request a new verification code")
    if otp.locked_until and otp.locked_until > now:
        raise Conflict("Too many incorrect codes. Try again in 15 minutes.")
    expected = _otp_hash(str(doc.id), purpose, code)
    if not hmac.compare_digest(expected, otp.code_hash):
        otp.attempts += 1
        if otp.attempts >= 5:
            otp.locked_until = now + OTP_LOCK
        await otp.save()
        raise Forbidden("The verification code is incorrect")
    otp.used_at = now
    await otp.save()
    if purpose == "sign":
        doc.status = "client_in_progress"
    _event(doc, "otp_verified", "client", {"purpose": purpose, "channel": otp.channel}, hash_ip(ip or "unknown"))
    await doc.save()
    token_cookie = _session_token(str(doc.id), purpose,
                                  int((now + timedelta(seconds=SESSION_TTL)).timestamp()),
                                  doc.session_version)
    return doc, token_cookie


async def session_agreement(session: str | None, purpose: str | None = None) -> tuple[Agreement, str]:
    parsed = verify_session_token(session)
    if parsed is None:
        raise Forbidden("Your secure agreement session has expired. Verify again to continue.")
    agreement_id, session_purpose, session_version = parsed
    if purpose and purpose != session_purpose:
        raise Forbidden("Verify again using the correct agreement action")
    doc = await get_agreement(agreement_id)
    if session_version != doc.session_version:
        raise Forbidden("This agreement session has been replaced. Verify again to continue.")
    if session_purpose == "view" and doc.status != "completed":
        raise NotFound("The signed agreement is not available")
    if session_purpose == "sign" and doc.status not in {"sent", "client_in_progress"}:
        raise Conflict("This agreement is no longer open for client review")
    return doc, session_purpose


async def public_view(doc: Agreement, *, signed: bool = False) -> dict[str, Any]:
    template = await AgreementTemplate.find_one(AgreementTemplate.version == doc.template_version)
    if template is None:
        raise Conflict("The agreement wording is unavailable")
    parent = await Agreement.get(doc.parent_agreement_id) if doc.parent_agreement_id else None
    return {
        "company": COMPANY,
        "reference": doc.reference,
        "parent_reference": parent.reference if parent else None,
        "status": doc.status,
        "template_version": doc.template_version,
        "clauses": template.clauses,
        "document_html": render.render_agreement_html(doc, template.clauses, blocks=template.blocks, signed=signed) if template.blocks else None,
        "fields": {rules.field_path(key): value.model_dump(mode="json") for key, value in doc.fields.items()},
        "schedule_b_computed": doc.schedule_b_computed,
        "variation_clause": doc.variation_clause,
        "parent_agreement_id": str(doc.parent_agreement_id) if doc.parent_agreement_id else None,
        "signatures": [sig.model_dump(mode="json", exclude={"image_key", "ip_hash", "user_agent", "verification"}) for sig in doc.signatures] if signed else [],
        "content_hash": rules.canonical_hash(doc.fields, doc.template_version, doc.template_hash),
        "signed": signed,
        "certificate": doc.sealed.get("certificate_json") if signed else None,
    }


async def request_change(doc: Agreement, reason: str, ip: str | None) -> None:
    if doc.status not in {"sent", "client_in_progress"}:
        raise Conflict("A change can be requested only while the agreement is open")
    doc.status = "changes_requested"
    doc.session_version += 1
    doc.token_hash = None
    doc.token_expires_at = None
    _event(doc, "changes_requested", "client", {"reason": reason}, hash_ip(ip or "unknown"))
    await doc.save()
    settings = get_settings()
    staff = [value.strip() for value in settings.alert_emails.split(",") if value.strip()]
    capture = _DIAGNOSTIC_CAPTURE.get()
    if staff or capture is not None:
        template = await messages.get_template("changes_requested", "email")
        variables = messages.message_variables(doc, link=f"https://bhcug.com/admin/agreements/{doc.id}")
        subject, body_html, plain = messages.render_email("changes_requested", template[0], variables)
        if capture is not None:
            capture.setdefault("messages", []).append({"stage": "changes_requested", "channel": "email"})
        elif staff:
            await get_email_provider().send(staff, subject, body_html, plain)
    await audit.record(None, "agreement.changes_requested", "agreement", str(doc.id), doc.reference,
                       after={"status": "changes_requested"}, ip_hash=hash_ip(ip or "unknown"))


def _decode_signature(signature_base64: str) -> bytes:
    raw = signature_base64.split(",", 1)[1] if "," in signature_base64 else signature_base64
    try:
        data = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValidationFailed("The signature image is invalid", {"signature_base64": "invalid"}) from exc
    if not data or len(data) > MAX_SIGNATURE_BYTES or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValidationFailed("Upload a valid PNG signature image", {"signature_base64": "invalid_png"})
    return data


def _credential_evidence(doc: Agreement, method: str, content_hash: str, challenge_role: str, *,
                         password: str | None, passkey: dict | None, challenge_token: str | None) -> dict[str, Any]:
    """Evidence for the non-image methods. Image methods carry their proof in the PNG."""
    if method == "password":
        return credentials.passphrase_evidence(password or "", str(doc.id), content_hash)
    if method == "biometric":
        return credentials.verify_passkey(str(doc.id), content_hash, challenge_role,
                                          challenge_token or "", passkey or {})
    return {}


async def _store_signature(doc: Agreement, role: str, name: str, method: str, signature_base64: str | None,
                           content_hash: str, *, ip: str | None, user_agent: str | None,
                           otp_verified_at: datetime | None = None, staff_user_id: str | None = None,
                           verification: dict[str, Any] | None = None) -> AgreementSignature:
    key: str | None = None
    if method in IMAGE_SIGNATURE_METHODS:
        if signature_base64 is None:
            raise ValidationFailed("A signature image is required for this method", {"signature_base64": "required"})
        data = _decode_signature(signature_base64)
        key = f"agreements/{doc.reference}/signatures/{role}-{secrets.token_hex(12)}.png"
        await get_storage().put(Bucket.PRIVATE, key, data, "image/png")
    return AgreementSignature(
        role=role, name=name, method=method, image_key=key, verification=verification or {},
        content_hash=content_hash,
        ip_hash=hash_ip(ip or "unknown"), user_agent=(user_agent or "")[:400] or None,
        otp_verified_at=otp_verified_at, staff_device_user_id=staff_user_id,
    )


async def client_sign(doc: Agreement, body, ip: str | None, user_agent: str | None) -> str:
    if doc.status not in {"sent", "client_in_progress"}:
        raise Conflict("This agreement is not ready for a client signature")
    template = await AgreementTemplate.find_one(AgreementTemplate.version == doc.template_version)
    if template is None or not template.is_published:
        raise Conflict("The agreement template is no longer available")
    current_hash = rules.canonical_hash(doc.fields, doc.template_version, doc.template_hash)
    if not hmac.compare_digest(current_hash, body.expected_content_hash):
        raise Conflict("The agreement changed since you reviewed it. Reload and review the latest version before signing.")
    if body.method not in {"drawn", "thumbprint", "password", "biometric"}:
        raise ValidationFailed("Choose a valid signing method", {"method": "invalid"})
    missing_consent = rules.missing_signing_consent(doc.fields)
    if missing_consent:
        raise ValidationFailed(
            "Complete the patient/representative initials and all required Schedule C consent, communication and authority details before signing.",
            {path: "required" for path in missing_consent},
        )
    decision_field = doc.fields.get(rules.field_key("schedule_c.decision_maker"))
    decision = str(decision_field.value or "").strip().lower() if decision_field else ""
    if body.role == "client" and decision and "patient" not in decision:
        body.role = "representative"
    if body.role not in {"client", "representative"}:
        raise ValidationFailed("The primary signatory must be the client or lawful representative", {"role": "invalid"})
    if any(s.role in {"client", "representative"} for s in doc.signatures):
        raise Conflict("A client signature has already been recorded")
    otp_rows = await AgreementOtp.find(AgreementOtp.agreement_id == doc.id,
                                       AgreementOtp.purpose == "sign",
                                       AgreementOtp.used_at != None).sort("-used_at").limit(1).to_list()  # noqa: E711
    if not otp_rows:
        raise Forbidden("Verify your contact details before signing")
    evidence = _credential_evidence(doc, body.method, current_hash, "client", password=body.password,
                                    passkey=body.passkey, challenge_token=body.challenge_token)
    sig = await _store_signature(doc, body.role, body.name, body.method, body.signature_base64,
                                 current_hash, ip=ip, user_agent=user_agent,
                                 otp_verified_at=otp_rows[0].used_at, verification=evidence)
    doc.signatures.append(sig)
    doc.status = "client_signed"
    doc.token_hash = None
    doc.token_expires_at = None
    doc.session_version += 1
    _event(doc, "client_signed", "client", {"role": body.role, "method": body.method, "content_hash": current_hash}, hash_ip(ip or "unknown"))
    await doc.save()
    await _send_message(doc, "client_signed_client", "email")
    await _send_message(doc, "client_signed_client", "sms")
    staff = get_settings().alert_emails.split(",")
    staff = [x.strip() for x in staff if x.strip()]
    capture = _DIAGNOSTIC_CAPTURE.get()
    if staff and capture is not None:
        capture.setdefault("messages", []).append({"stage": "client_signed_staff", "channel": "email"})
    elif staff:
        template_msg, _, _ = await messages.get_template("client_signed_staff", "email")
        vars_ = messages.message_variables(doc, link=f"https://bhcug.com/admin/agreements/{doc.id}")
        subject, body_html, plain = messages.render_email("client_signed_staff", template_msg, vars_)
        await get_email_provider().send(staff, subject, body_html, plain)
    await audit.record(None, "agreement.client_signed", "agreement", str(doc.id), doc.reference,
                       after={"status": "client_signed", "content_hash": current_hash}, ip_hash=hash_ip(ip or "unknown"))
    return current_hash


async def client_passkey_options(doc: Agreement, name: str) -> dict[str, Any]:
    """Challenge for the client's device biometric, bound to the current content hash."""
    if doc.status not in {"sent", "client_in_progress"}:
        raise Conflict("This agreement is not ready for a client signature")
    content_hash = rules.canonical_hash(doc.fields, doc.template_version, doc.template_hash)
    return credentials.issue_passkey_options(str(doc.id), content_hash, "client", name)


async def staff_passkey_options(doc: Agreement, principal: Principal, name: str) -> dict[str, Any]:
    if doc.status != "client_signed":
        raise Conflict("Only a client-signed agreement can be countersigned")
    content_hash = rules.canonical_hash(doc.fields, doc.template_version, doc.template_hash)
    return credentials.issue_passkey_options(str(doc.id), content_hash, "bloomwell", name)


async def _seal(doc: Agreement, content_hash: str) -> None:
    template = await AgreementTemplate.find_one(AgreementTemplate.version == doc.template_version)
    if template is None:
        raise Conflict("The published agreement text is unavailable")
    signature_images = {}
    for sig in doc.signatures:
        if sig.image_key:
            signature_images[sig.image_key] = await get_storage().get(Bucket.PRIVATE, sig.image_key)
    certificate = render.make_certificate(doc, content_hash)
    html_doc = render.render_agreement_html(doc, template.clauses, blocks=template.blocks, signed=True,
                                            certificate=certificate, signature_images=signature_images)
    pdf_bytes = render.render_pdf(html_doc)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    key = f"agreements/{doc.reference}/sealed/{pdf_hash}.pdf"
    await get_storage().put(Bucket.PRIVATE, key, pdf_bytes, "application/pdf")
    doc.sealed = {
        "pdf_key": key, "pdf_sha256": pdf_hash, "sealed_at": datetime.now(UTC),
        "certificate_json": certificate,
    }
    doc.status = "completed"
    doc.completed_at = datetime.now(UTC)
    _event(doc, "sealed", "system", {"pdf_sha256": pdf_hash, "content_hash": content_hash})
    await doc.save()


async def countersign(doc: Agreement, principal: Principal, name: str, method: str,
                      signature_base64: str | None, ip: str | None, user_agent: str | None, *,
                      password: str | None = None, passkey: dict | None = None,
                      challenge_token: str | None = None) -> dict[str, Any]:
    if doc.status != "client_signed":
        raise Conflict("Only a client-signed agreement can be countersigned")
    template = await AgreementTemplate.find_one(AgreementTemplate.version == doc.template_version)
    if template is None or not template.is_published:
        raise Conflict("The agreement template is unavailable")
    content_hash = rules.canonical_hash(doc.fields, doc.template_version, doc.template_hash)
    client_sig = next((s for s in doc.signatures if s.role in {"client", "representative"}), None)
    if client_sig is None or not hmac.compare_digest(client_sig.content_hash, content_hash):
        raise Conflict("The signed agreement hash no longer matches the current content")
    existing_bloomwell = next((s for s in doc.signatures if s.role == "bloomwell"), None)
    if existing_bloomwell is not None:
        if not hmac.compare_digest(existing_bloomwell.content_hash, content_hash):
            raise Conflict("The stored Bloomwell signature does not match the agreement content")
    else:
        if method == "password":
            # Staff re-enter their own account password; never trust a client-side flag.
            wait = limiter.hit(f"agreement-countersign-pw:{principal.user_id}", 5, 900)
            if wait:
                raise Conflict(f"Too many password attempts. Try again in {wait} seconds.")
            user = await User.get(PydanticObjectId(principal.user_id))
            if user is None or not user.is_active or not verify_password(password or "", user.password_hash):
                raise Forbidden("Your account password is incorrect")
            evidence = {"type": "account_password", "verified_user_id": principal.user_id}
        else:
            evidence = _credential_evidence(doc, method, content_hash, "bloomwell", password=None,
                                            passkey=passkey, challenge_token=challenge_token)
        sig = await _store_signature(doc, "bloomwell", name, method, signature_base64,
                                     content_hash, ip=ip, user_agent=user_agent,
                                     staff_user_id=principal.user_id, verification=evidence)
        doc.signatures.append(sig)
    doc.session_version += 1
    doc.token_hash = None
    doc.token_expires_at = None
    _event(doc, "bloomwell_countersigned", principal.user_id, {"content_hash": content_hash}, ip)
    await doc.save()
    await _seal(doc, content_hash)
    # The signed-copy token is distinct from the one-use review token.
    view_token = secrets.token_urlsafe(32)
    capture = _DIAGNOSTIC_CAPTURE.get()
    if capture is not None:
        capture["view_token"] = view_token
    doc.view_token_hash = _token_hash(view_token)
    await doc.save()
    link = messages.public_link(view_token)
    await _send_message(doc, "completed_client", "email", link=link)
    await _send_message(doc, "completed_client", "sms", link=link)
    await audit.record(principal, "agreement.completed", "agreement", str(doc.id), doc.reference,
                       after={"status": "completed", "content_hash": content_hash,
                              "pdf_sha256": doc.sealed.get("pdf_sha256")}, ip_hash=ip)
    return {"agreement": agreement_detail(doc), "certificate": doc.sealed.get("certificate_json")}


async def get_sealed_pdf(doc: Agreement) -> bytes:
    key = doc.sealed.get("pdf_key") if doc.status == "completed" else None
    if not key:
        raise NotFound("The completed agreement PDF is not available")
    data = await get_storage().get(Bucket.PRIVATE, key)
    expected = doc.sealed.get("pdf_sha256")
    if not expected or not hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected):
        raise Conflict("The sealed agreement file failed its integrity check")
    return data


async def void(doc: Agreement, principal: Principal, reason: str, ip: str | None) -> None:
    if doc.status == "completed":
        raise Conflict("Completed agreements cannot be voided. Use an amendment.")
    if doc.status == "voided":
        raise Conflict("This agreement is already voided")
    doc.status = "voided"
    doc.session_version += 1
    doc.voided_at = datetime.now(UTC)
    doc.void_reason = reason
    doc.token_hash = None
    doc.view_token_hash = None
    doc.token_expires_at = None
    _event(doc, "voided", principal.user_id, {"reason": reason}, ip)
    await doc.save()
    await _send_message(doc, "voided", "email")
    if _real_phone(doc):
        await _send_message(doc, "voided", "sms")
    await audit.record(principal, "agreement.voided", "agreement", str(doc.id), doc.reference,
                       after={"status": "voided", "reason": reason}, ip_hash=ip)


async def delete_agreement(doc: Agreement, principal: Principal, ip: str | None) -> None:
    """Permanently remove an agreement that was never sent or is already closed.

    Sent or signed agreements must be voided first (that notifies the client and closes the
    link); completed agreements are legal records and are never deleted. The audit log keeps
    a record of every deletion.
    """
    blocked = rules.deletion_block_reason(doc.status)
    if blocked:
        raise Conflict(blocked)
    if await Agreement.find(Agreement.parent_agreement_id == doc.id).count():
        raise Conflict("This agreement has amendments. Delete the amendments first.")
    keys = [sig.image_key for sig in doc.signatures if sig.image_key]
    if doc.sealed.get("pdf_key"):
        keys.append(doc.sealed["pdf_key"])
    for key in keys:
        try:
            await get_storage().delete(Bucket.PRIVATE, key)
        except Exception:  # best effort: never block the delete on storage
            log.warning("could not remove stored file for %s", doc.reference)
    reference, agreement_id, status, void_reason = doc.reference, str(doc.id), doc.status, doc.void_reason
    await AgreementOtp.find(AgreementOtp.agreement_id == doc.id).delete()
    await doc.delete()
    await audit.record(principal, "agreement.deleted", "agreement", agreement_id, reference,
                       before={"status": status, "reason": void_reason}, ip_hash=ip)


async def save_template_draft(body: TemplateDraft, principal: Principal) -> AgreementTemplate:
    clauses = dict(body.clauses)
    for key in ("1.1", "14.1"):
        if key not in clauses:
            raise ValidationFailed("Template needs clauses 1.1 and 14.1", {key: "required"})
        clauses[key] = clauses[key].replace("info@wellnesthomecareug.com", "info@bhcug.com")
    latest = await AgreementTemplate.find().sort("-version").limit(1).to_list()
    version = (latest[0].version + 1) if latest else 1
    template = AgreementTemplate(version=version, clauses=clauses,
                                 template_hash=rules.template_hash(clauses),
                                 source_file=body.source_file)
    await template.insert()
    await audit.record(principal, "agreement.template_draft_saved", "agreement_template", str(template.id),
                       f"v{version}", after={"version": version, "clause_count": len(clauses)})
    return template


async def publish_template(version: int, principal: Principal, ip: str | None) -> AgreementTemplate:
    template = await AgreementTemplate.find_one(AgreementTemplate.version == version)
    if template is None:
        raise NotFound("Template version not found")
    if template.is_published:
        raise Conflict("Published template versions are immutable")
    for clause in ("1.1", "14.1"):
        if "info@bhcug.com" not in template.clauses.get(clause, ""):
            raise ValidationFailed("Both email corrections must be present before publishing", {clause: "info@bhcug.com required"})
    try:
        rules.validate_template_sections(template.clauses)
    except ValueError as exc:
        raise ValidationFailed(
            "The complete clauses 1.0–15.0 and Schedules A, B and C are required before publishing.",
            {"clauses": str(exc)},
        ) from exc
    template.template_hash = rules.template_hash(template.clauses, template.blocks)
    template.is_published = True
    template.published_at = datetime.now(UTC)
    template.published_by = _oid(principal.user_id)
    await template.save()
    await audit.record(principal, "agreement.template_published", "agreement_template", str(template.id),
                       f"v{version}", after={"version": version, "template_hash": template.template_hash}, ip_hash=ip)
    return template


async def save_message_template(stage_key: str, channel: Literal["email", "sms"],
                                body: MessageTemplatePatch, principal: Principal) -> AgreementMessageTemplate:
    value = body.model_dump()
    try:
        messages.validate_template(stage_key, channel, value)
    except ValueError as exc:
        raise ValidationFailed(str(exc), {"template": "invalid"}) from exc
    template = await AgreementMessageTemplate.find_one(
        AgreementMessageTemplate.stage_key == stage_key,
        AgreementMessageTemplate.channel == channel,
        AgreementMessageTemplate.locale == "en",
    )
    if template:
        template.subject, template.preheader, template.body = body.subject, body.preheader, body.body
        template.button, template.footer_note = body.button, body.footer_note
        template.version += 1
        template.updated_by = _oid(principal.user_id)
        template.is_default = False
        await template.save()
    else:
        template = AgreementMessageTemplate(
            stage_key=stage_key, channel=channel, subject=body.subject,
            preheader=body.preheader, body=body.body, button=body.button,
            footer_note=body.footer_note, version=2,
            updated_by=_oid(principal.user_id), is_default=False,
        )
        await template.insert()
    await audit.record(principal, "agreement.message_template_saved", "agreement_message_template",
                       str(template.id), f"{stage_key}/{channel}", after={"version": template.version})
    return template


async def reset_message_template(stage_key: str, channel: Literal["email", "sms"], principal: Principal) -> None:
    template = await AgreementMessageTemplate.find_one(
        AgreementMessageTemplate.stage_key == stage_key,
        AgreementMessageTemplate.channel == channel,
        AgreementMessageTemplate.locale == "en",
    )
    if template:
        await template.delete()
    await audit.record(principal, "agreement.message_template_reset", "agreement_message_template",
                       item_label=f"{stage_key}/{channel}", after={"reset_to_default": True})


async def preview_agreement(doc: Agreement) -> str:
    template = await AgreementTemplate.find_one(AgreementTemplate.version == doc.template_version)
    if template is None:
        return "<p>Agreement wording has not been loaded.</p>"
    return render.render_agreement_html(doc, template.clauses, blocks=template.blocks)


async def sweep_agreements(now: datetime | None = None) -> int:
    """Expire unsigned agreements and send each plan reminder once per open agreement."""
    now = now or datetime.now(UTC)
    changed = 0
    try:
        docs = await Agreement.find(Agreement.status.in_(["sent", "client_in_progress"])).to_list()
        for doc in docs:
            expiry = doc.expires_at or doc.token_expires_at
            if expiry and expiry <= now:
                doc.status = "expired"
                doc.token_hash = None
                doc.token_expires_at = None
                _event(doc, "expired", "scheduler")
                await doc.save()
                await _send_message(doc, "expired", "email")
                await audit.record(None, "agreement.expired", "agreement", str(doc.id), doc.reference,
                                   after={"status": "expired"})
                changed += 1
                continue

            elapsed = now - (doc.token_issued_at or doc.created_at)
            sent_stages = {e.detail.get("stage") for e in doc.events if e.type == "reminder_sent"}
            due: list[str] = []
            if elapsed >= timedelta(hours=48) and "reminder_1" not in sent_stages:
                due.append("reminder_1")
            if elapsed >= timedelta(days=5) and "reminder_2" not in sent_stages:
                due.append("reminder_2")
            if expiry and timedelta(0) < expiry - now <= timedelta(hours=48) and "expiring_soon" not in sent_stages:
                due.append("expiring_soon")

            # One new token per sweep, not one per message: otherwise later messages would
            # immediately invalidate the link in earlier messages from the same scheduler run.
            prior_token_hash = doc.token_hash
            prior_session_version = doc.session_version
            link = await _issue_reminder_link(doc) if due else ""
            any_delivery = False
            for stage in due:
                delivered = False
                if doc.fields.get(rules.field_key("client.email")) and doc.fields[rules.field_key("client.email")].value:
                    delivered = await _send_message(doc, stage, "email", link=link) or delivered
                if _real_phone(doc):
                    sms_stage = stage
                    if (sms_stage, "sms") in messages.DEFAULTS:
                        delivered = await _send_message(doc, sms_stage, "sms", link=link) or delivered
                if delivered:
                    any_delivery = True
                    _event(doc, "reminder_sent", "scheduler", {"stage": stage})
                    changed += 1
            if due and not any_delivery:
                # Retain the prior still-valid client link if every delivery channel failed.
                doc.token_hash = prior_token_hash
                doc.session_version = prior_session_version
            await doc.save()
    except Exception:
        log.exception("agreement lifecycle sweep failed")
        try:
            await audit.record_system_event(action="agreements.sweep_failed",
                message="The agreement reminder and expiry sweep failed. Review protected server logs.",
                severity="error", source="scheduler", event_type="error")
        except Exception:
            log.exception("could not persist agreement sweep failure event")
    return changed


async def _issue_reminder_link(doc: Agreement) -> str:
    # Tokens are stored only as hashes. Keep the original expiry; reminders do not extend it.
    token = secrets.token_urlsafe(32)
    doc.token_hash = _token_hash(token)
    doc.session_version += 1
    # Keep token_issued_at unchanged: reminder cadence is measured from the
    # original send/reissue, not from each scheduler-created replacement link.
    await doc.save()
    return messages.public_link(token)


async def reissue_link(doc: Agreement, principal: Principal, channels: Literal["email", "sms", "both"],
                       ip: str | None = None) -> dict[str, Any]:
    if doc.status not in {"draft", "sent", "client_in_progress", "changes_requested", "expired"}:
        raise Conflict("A link cannot be issued for this agreement")
    await _assert_customer_delivery_ready(doc, channels)
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    doc.token_hash = _token_hash(token)
    doc.session_version += 1
    doc.token_issued_at = now
    doc.token_expires_at = now + timedelta(days=14)
    doc.expires_at = doc.token_expires_at
    doc.status = "sent"
    doc.channel_preference = channels
    _event(doc, "link_reissued", principal.user_id, {"channels": channels}, ip)
    await doc.save()
    link = messages.public_link(token)
    results: dict[str, bool] = {}
    message_stage = "amendment_sent" if doc.parent_agreement_id else "agreement_sent"
    if channels in {"email", "both"}:
        results["email"] = await _send_message(doc, message_stage, "email", link=link, expires_days=14)
    if channels in {"sms", "both"}:
        results["sms"] = await _send_message(doc, message_stage, "sms", link=link, expires_days=14)
    successful = [channel for channel, ok in results.items() if ok]
    if successful:
        _event(doc, "link_reissued" if len(successful) == len(results) else "link_reissue_partial",
               "system", {"requested_channels": list(results), "successful_channels": successful})
    else:
        doc.status = "draft"
        doc.token_hash = None
        doc.token_issued_at = None
        doc.token_expires_at = None
        doc.expires_at = None
        doc.session_version += 1
        _event(doc, "link_reissue_delivery_failed", "system", {"requested_channels": list(results)})
    await doc.save()
    await audit.record(principal, "agreement.link_reissued", "agreement", str(doc.id), doc.reference,
                       after={"status": doc.status, "channels": channels, "delivery": results}, ip_hash=ip)
    return {"agreement": agreement_detail(doc), "delivery": results}


async def amend(doc: Agreement, principal: Principal, clause: str, ip: str | None = None) -> Agreement:
    if doc.status != "completed":
        raise Conflict("Only completed agreements can be amended")
    if not clause.strip() or len(clause) > 120:
        raise ValidationFailed("Name the clause being varied", {"variation_clause": "required"})
    year = datetime.now(UTC).year
    reference = await repository.next_reference(year)
    copied_fields = {k: v.model_copy(deep=True) for k, v in doc.fields.items()}
    # Consent and initials relate to the specific version of the care arrangement.
    # They must be collected again for the amendment rather than inherited as consent
    # to terms the Patient has not yet reviewed.
    for path in ("schedule_a.patient_rep_initials", "schedule_a.patient_rep_initials_date",
                 "schedule_c.care_consent", "schedule_c.initials"):
        key = rules.field_key(path)
        if key in copied_fields:
            copied_fields[key] = copied_fields[key].model_copy(update={
                "value": None, "revision": 0, "entered_by_staff": False,
                "updated_at": datetime.now(UTC), "updated_by": None,
            })
    clone = Agreement(
        reference=reference, status="draft", template_version=doc.template_version,
        template_hash=doc.template_hash, created_by=_oid(principal.user_id),
        assigned_nurse_id=doc.assigned_nurse_id, fields=copied_fields,
        schedule_b_computed=dict(doc.schedule_b_computed), parent_agreement_id=doc.id,
        variation_clause=clause,
    )
    _event(clone, "amendment_created", principal.user_id,
           {"parent_agreement_id": str(doc.id), "variation_clause": clause}, ip)
    await clone.insert()
    await audit.record(principal, "agreement.amendment_created", "agreement", str(clone.id), reference,
                       after={"parent_agreement_id": str(doc.id), "variation_clause": clause}, ip_hash=ip)
    return clone
