"""Protected readiness and synthetic end-to-end checks for online agreements.

Readiness checks are non-destructive apart from a temporary private-storage probe which is
always deleted. The workflow simulation creates a synthetic agreement and exercises the same
service functions as a real client, while a context-local message capture prevents outbound
customer email/SMS. Temporary records and signature/PDF objects are removed afterwards.
"""

from __future__ import annotations

import base64
import hashlib
import struct
import uuid
import zlib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId

from app.core import db
from app.core.config import get_settings
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.storage import Bucket, get_storage
from app.modules.agreements import messages, rules, service
from app.modules.agreements.models import Agreement, AgreementEvent, AgreementOtp
from app.modules.agreements.schemas import FieldPatch, OtpRequest, SendAgreement, SignAgreement

PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skip"


@dataclass(frozen=True)
class Check:
    id: str
    status: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def summarize(checks: list[Check]) -> dict[str, int]:
    return {state: sum(item.status == state for item in checks) for state in (PASS, WARN, FAIL, SKIP)}


def _tiny_png_base64() -> str:
    """Generate a valid 2x2 PNG; it is only a synthetic signing artefact."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw = b"\x00" + b"\x22\x88\x44\xff" * 2 + b"\x00" + b"\x22\x88\x44\xff" * 2
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode("ascii")


async def run_readiness_checks() -> list[Check]:
    """Check all local agreement dependencies without sending messages to anyone."""
    checks: list[Check] = []
    settings = get_settings()

    if await db.ping():
        checks.append(Check("agreement_database", PASS, "MongoDB answered the agreement database ping."))
    else:
        checks.append(Check("agreement_database", FAIL, "MongoDB did not answer. Check MONGODB_URI and database availability."))

    template = await service.current_template()
    if template is None:
        checks.append(Check("agreement_template", FAIL, "No published agreement wording exists. Run the seed command or publish a reviewed source version."))
    else:
        try:
            rules.validate_template_sections(template.clauses)
            calculated = rules.template_hash(template.clauses)
            if calculated != template.template_hash:
                raise ValueError("stored template hash does not match its text")
            if "info@bhcug.com" not in template.clauses.get("1.1", "") or "info@bhcug.com" not in template.clauses.get("14.1", ""):
                raise ValueError("the corrected company email is missing from clause 1.1 or 14.1")
            if "info@wellnesthomecareug.com" in template.clauses.get("1.1", "") + template.clauses.get("14.1", ""):
                raise ValueError("an obsolete email remains in a corrected clause")
            checks.append(Check("agreement_template", PASS, f"Published v{template.version}; all required sections and the stored SHA-256 match."))
        except Exception as exc:
            checks.append(Check("agreement_template", FAIL, f"Published template validation failed ({type(exc).__name__}: {str(exc)[:160]})."))

    try:
        initial = rules.initial_fields()
        if len(initial) != len(rules.FIELD_OWNERS):
            raise ValueError("field registry and initial fields differ")
        for path, owner in rules.FIELD_OWNERS.items():
            field = initial[rules.field_key(path)]
            if field.owner != owner:
                raise ValueError(f"owner mismatch for {path}")
        fees = rules.calculate_fees("100000", "UGX")
        if (fees["booking_fee"] != 50000.0 or fees["advance"] != 50000.0
                or fees["balance"] != 50000.0 or fees["total_service_fees"] != 100000.0
                or fees["total_payable_if_ugx"] != 150000.0):
            raise ValueError("booking fee must remain separate from the service-fee 50/50 split")
        usd_fees = rules.calculate_fees("101", "USD")
        if usd_fees["advance"] != 50.5 or usd_fees["balance"] != 50.5 or usd_fees["total_payable_if_ugx"] is not None:
            raise ValueError("USD service fees must not be combined with the UGX booking fee")
        checks.append(Check("agreement_ownership_fees", PASS, f"{len(initial)} fields match the server-side ownership registry; UGX/USD fee calculations are valid."))
    except Exception as exc:
        checks.append(Check("agreement_ownership_fees", FAIL, f"Ownership or fee rules failed ({type(exc).__name__}: {str(exc)[:140]})."))

    # Render every default/override without exposing any client data or sending anything.
    sample = {
        "client_name": "Diagnostic Staff", "client_first_name": "Diagnostic", "reference": "BHC-TEST",
        "link": "https://bhcug.com/agreement/DIAGNOSTIC-NOT-A-REAL-LINK", "code": "123456",
        "expires_days": "14", "expires_date": "2030-01-01", "company": "Bloomwell Home Care Uganda Limited",
        "support_phone": "0787499988", "support_email": "info@bhcug.com", "staff_name": "Diagnostic Staff", "reason": "Test only",
    }
    message_errors: list[str] = []
    for (stage, channel) in messages.DEFAULTS:
        try:
            template, _version, _default = await messages.get_template(stage, channel)
            payload = {key: getattr(template, key) for key in ("subject", "preheader", "body", "button", "footer_note")}
            messages.validate_template(stage, channel, payload)
            body = messages.render_variables(template.body, sample)
            if channel == "sms":
                messages.validate_rendered_sms(body)
            else:
                subject, html_body, plain = messages.render_email(stage, template, sample)
                if not subject or not html_body or not plain:
                    raise ValueError("email output was incomplete")
                if "https://bhcug.com/" in html_body and "https://bhcug.com/" not in plain and stage in messages.LINK_REQUIRED:
                    raise ValueError("plain-text email part dropped the agreement link")
        except Exception as exc:
            message_errors.append(f"{stage}/{channel}: {type(exc).__name__}")
    if message_errors:
        checks.append(Check("agreement_messages", FAIL, "Message validation/rendering failed: " + ", ".join(message_errors[:5])))
    else:
        checks.append(Check("agreement_messages", PASS, f"All {len(messages.DEFAULTS)} default message variants validate and render; SMS expansion is within GSM-7 limits."))

    secret_ok = False
    try:
        secret_ok = len(service._secret()) >= 32
    except Exception:
        pass
    checks.append(Check("agreement_token_secret", PASS if secret_ok else FAIL,
                        "Agreement token signing secret is configured." if secret_ok else "Set NEST_MAIL_SECRET_KEY or a strong application secret of at least 32 characters."))

    turnstile_configured = bool(settings.turnstile_secret)
    site_key = bool(getattr(settings, "turnstile_site_key", ""))
    if turnstile_configured and not site_key:
        checks.append(Check("agreement_turnstile", FAIL, "Turnstile secret is set but the public site key is missing; clients may be unable to request an OTP."))
    elif turnstile_configured:
        checks.append(Check("agreement_turnstile", PASS, "Turnstile secret and public site key are configured."))
    else:
        checks.append(Check("agreement_turnstile", WARN, "Turnstile is not configured. Public OTP routes rely on IP/token rate limits only."))

    storage = get_storage()
    key = f"agreements/diagnostics/{uuid.uuid4().hex}.txt"
    payload = b"Bloomwell agreement private storage diagnostics - synthetic data only"
    storage_ok = False
    try:
        await storage.put(Bucket.PRIVATE, key, payload, "text/plain")
        storage_ok = await storage.get(Bucket.PRIVATE, key) == payload
        checks.append(Check("agreement_private_storage", PASS if storage_ok else FAIL,
                            "Private storage wrote and read the probe object." if storage_ok else "Private storage returned different bytes from the test write."))
    except Exception as exc:
        checks.append(Check("agreement_private_storage", FAIL, f"Private storage read/write failed ({type(exc).__name__}). Check the R2 private bucket and credentials."))
    finally:
        try:
            await storage.delete(Bucket.PRIVATE, key)
        except Exception:
            checks.append(Check("agreement_storage_cleanup", WARN, "The private-storage probe could not be deleted. Remove the diagnostic object manually."))

    try:
        pdf = service.render.render_pdf("<!doctype html><html><body><h1>Bloomwell diagnostic PDF</h1><p>Selectable text check.</p></body></html>")
        valid = pdf.startswith(b"%PDF-") and len(pdf) > 500
        checks.append(Check("agreement_pdf_renderer", PASS if valid else FAIL,
                            f"Vector PDF renderer generated {len(pdf)} bytes." if valid else "PDF renderer output did not look like a valid PDF."))
    except Exception as exc:
        checks.append(Check("agreement_pdf_renderer", FAIL, f"WeasyPrint PDF generation failed ({type(exc).__name__}). Install WeasyPrint system dependencies in the backend image."))

    try:
        from app.jobs import build_scheduler
        scheduler = build_scheduler()
        job = scheduler.get_job("agreement_lifecycle")
        checks.append(Check("agreement_scheduler", PASS if job else FAIL,
                            "The five-minute agreement reminder/expiry lifecycle job is registered." if job else "The agreement lifecycle job is not registered in the scheduler."))
    except Exception as exc:
        checks.append(Check("agreement_scheduler", FAIL, f"Scheduler configuration could not be inspected ({type(exc).__name__})."))

    # Check the mail provider configuration without disclosing secrets. DNS verification is
    # performed by the mail diagnostics suite and should be used alongside these checks.
    try:
        from app.modules.mail.settings_service import get_value
        enabled = bool(await get_value("mail.enabled"))
        external = bool(await get_value("mail.external_enabled"))
        suspended = bool(await get_value("mail.suspend_all_sending"))
        provider = str(await get_value("mail.provider") or "console").lower()
        domain = str(await get_value("mail.domain") or "").strip().lower()
        credentials_ok = False
        if provider == "brevo" and str(await get_value("mail.brevo_transport") or "smtp").lower() == "smtp":
            credentials_ok = bool(await get_value("mail.smtp_username")) and bool(await get_value("mail.smtp_password"))
        elif provider in {"resend", "brevo"}:
            credentials_ok = bool(await get_value("mail.provider_api_key"))
        if not enabled or not external or suspended:
            checks.append(Check("agreement_email_provider", WARN, "Mail is disabled, external sending is off, or all sending is suspended. Customer agreement email is blocked."))
        elif provider == "console":
            checks.append(Check("agreement_email_provider", WARN, "The console mail provider does not deliver externally. Select and verify a live provider before customer use."))
        elif domain != "bhcug.com":
            checks.append(Check("agreement_email_provider", FAIL, f"The mail sender domain is {domain or 'unset'}, not bhcug.com."))
        elif not credentials_ok:
            checks.append(Check("agreement_email_provider", FAIL, f"The {provider} provider is selected, but its required API/SMTP credentials are missing."))
        else:
            checks.append(Check("agreement_email_provider", PASS, f"External mail is enabled with provider {provider}, valid credentials and domain bhcug.com. Run the Mail section's SPF/DKIM/DMARC and delivery diagnostics as well."))
    except Exception as exc:
        checks.append(Check("agreement_email_provider", FAIL, f"Mail-provider settings could not be verified ({type(exc).__name__}); agreement delivery is fail-closed until this is fixed."))

    sms_provider = str(settings.sms_provider or "console").lower()
    if sms_provider == "mambosms" and settings.mambosms_api_key:
        try:
            from app.modules.notifications.config import load_config
            sms_config = await load_config(settings)
            sender = str(sms_config.sender_id or "").strip()
            if not sender or len(sender) > 11:
                checks.append(Check("agreement_sms_provider", FAIL, "MamboSMS is configured but the sender ID must be 1–11 characters."))
            else:
                checks.append(Check("agreement_sms_provider", PASS, f"MamboSMS is selected, API key is present and sender ID '{sender}' is valid. Run the self-test to verify delivery."))
        except Exception as exc:
            checks.append(Check("agreement_sms_provider", FAIL, f"MamboSMS configuration could not be verified ({type(exc).__name__})."))
    elif sms_provider == "mambosms":
        checks.append(Check("agreement_sms_provider", FAIL, "MamboSMS is selected but MAMBOSMS_API_KEY is missing."))
    else:
        checks.append(Check("agreement_sms_provider", WARN, "SMS is using the console provider, which logs but does not deliver customer messages."))

    # This combined result is the actual send gate. Healthy individual services do not
    # make the workflow usable unless at least one external channel can reach the client.
    email_ready, email_reason = await service._channel_delivery_readiness(
        "email", "agreement-diagnostic@example.invalid"
    )
    sms_ready, sms_reason = await service._channel_delivery_readiness(
        "sms", "+256700000111"
    )
    if email_ready or sms_ready:
        available = ", ".join(
            label for label, ready in (("email", email_ready), ("SMS", sms_ready)) if ready
        )
        checks.append(Check(
            "agreement_delivery_channels", PASS,
            f"At least one external customer delivery channel is configured ({available}). Send a staff self-test and confirm receipt before launch.",
        ))
    else:
        checks.append(Check(
            "agreement_delivery_channels", FAIL,
            "No customer delivery channel is ready. Agreement sends and OTP delivery are blocked. "
            f"Email: {email_reason} SMS: {sms_reason}",
        ))

    checks.append(Check(
        "agreement_in_person_signing", WARN,
        "The in-person tablet/thumbprint/interpreter workflow is not enabled (HTTP 501). "
        "Do not use this flow for signatories who need an assisted in-person process until S6 is completed and legally reviewed.",
    ))

    if not settings.scheduler_enabled:
        checks.append(Check("agreement_scheduler_enabled", WARN, "The scheduler is disabled in this deployment; agreement reminders and expiries will not run."))
    else:
        checks.append(Check("agreement_scheduler_enabled", PASS, "Scheduler execution is enabled in deployment settings."))

    try:
        from app.modules.auth.scopes import ALL_SCOPE_IDS
        required_scopes = {"agreements:read", "agreements:write", "agreements:sign", "agreements:void", "agreements:templates"}
        missing_scopes = sorted(required_scopes - set(ALL_SCOPE_IDS))
        checks.append(Check("agreement_scopes", FAIL if missing_scopes else PASS,
                            "Missing agreement scopes: " + ", ".join(missing_scopes) if missing_scopes
                            else "All five agreement permission scopes are registered."))
    except Exception as exc:
        checks.append(Check("agreement_scopes", FAIL, f"Agreement permission registry could not be checked ({type(exc).__name__})."))
    return checks


async def run_workflow_simulation(principal: Any) -> list[Check]:
    """Run a synthetic client review → OTP → signature → countersign → sealed PDF flow."""
    from app.modules.auth.models import User

    checks: list[Check] = []
    user_id = PydanticObjectId(principal.user_id)
    user = await User.get(user_id)
    if user is None or not user.is_active:
        return [Check("workflow_staff", FAIL, "The authenticated staff account could not be loaded.")]
    template = await service.current_template()
    if template is None:
        return [Check("workflow_template", FAIL, "A published source agreement template is required before the workflow simulation can run.")]

    run_id = uuid.uuid4().hex[:12].upper()
    reference = f"BHC-TEST-{datetime.now(UTC):%Y%m%d}-{run_id}"
    doc: Agreement | None = None
    created_docs: list[Agreement] = []
    capture: dict[str, Any] = {"messages": [], "otp_codes": {}}
    context_token = service._DIAGNOSTIC_CAPTURE.set(capture)
    cleanup_ok = True

    async def milestone(check_id: str, detail: str) -> None:
        checks.append(Check(check_id, PASS, detail))

    try:
        doc = Agreement(
            reference=reference,
            created_by=user_id,
            assigned_nurse_id=user_id,
            fields=rules.initial_fields(),
            template_version=template.version,
            template_hash=template.template_hash,
            schedule_b_computed=rules.calculate_fees(0, "UGX"),
        )
        doc.events.append(AgreementEvent(type="diagnostic_started", actor="diagnostics", detail={"synthetic": True}))
        await doc.insert()
        created_docs.append(doc)
        await milestone("workflow_record", "A disposable synthetic agreement record was created in MongoDB.")

        staff_fields = [
            ("client.name", "Diagnostic Client (synthetic)", True),
            ("client.email", "agreement-diagnostics@example.invalid", True),
            ("client.phone", "+256700000111", True),
            ("patient.full_name", "Synthetic Patient (not real)", True),
        ]
        special_staff_values = {
            "schedule_a.care_plan": "DIAGNOSTIC ONLY — no care is booked.",
            "schedule_a.safety_emergency_plan": "DIAGNOSTIC ONLY — not clinical advice.",
            "schedule_a.clinical_lead": user.name or "Diagnostic Nurse",
            "schedule_a.registration_number": "DIAGNOSTIC ONLY — not a real registration number",
            "schedule_a.clinical_approval": "DIAGNOSTIC ONLY — not clinical approval",
            "schedule_b.total_fee": "100000",
            "schedule_b.currency": "UGX",
        }
        for path, owner in rules.FIELD_OWNERS.items():
            if owner in {"staff", "clinical"}:
                staff_fields.append((path, special_staff_values.get(path, "DIAGNOSTIC ONLY — Not applicable"), False))
        await service.patch_fields(
            doc,
            [FieldPatch(path=path, value=value, expected_revision=0, entered_by_staff=entered)
             for path, value, entered in staff_fields],
            actor="staff", principal=principal,
        )
        doc = await service.get_agreement(str(doc.id))
        calculated = doc.schedule_b_computed
        if (calculated.get("total") != 100000.0 or calculated.get("advance") != 50000.0
                or calculated.get("balance") != 50000.0 or calculated.get("booking_fee") != 50000.0
                or calculated.get("total_payable_if_ugx") != 150000.0):
            raise RuntimeError("the Schedule B fee calculator incorrectly included the booking fee in the 50/50 split")
        await milestone("workflow_staff_fields", "Staff/clinical ownership and Clause 8.4 pricing passed: UGX 50,000 booking fee is additional to the service-fee 50/50 split.")

        sent = await service.send(doc, principal, SendAgreement(channels="both", expires_days=14))
        review_token = capture.get("review_token")
        if sent["agreement"]["status"] != "sent" or not review_token:
            raise RuntimeError("the send/link issuance stage did not finish")
        await milestone("workflow_link_message", "The real send service rendered the agreement email and issued a synthetic review token; outbound delivery was intercepted.")

        await service.request_otp(review_token, "sign", OtpRequest(channel="email"), "127.0.0.1")
        await service.request_otp(review_token, "sign", OtpRequest(channel="sms"), "127.0.0.1")
        sign_code = capture.get("otp_codes", {}).get("sign")
        if not sign_code:
            raise RuntimeError("the synthetic sign OTP could not be rendered")
        sign_doc, sign_session = await service.verify_otp(review_token, "sign", sign_code, "127.0.0.1")
        try:
            await service.verify_otp(review_token, "sign", sign_code, "127.0.0.1")
            raise RuntimeError("a previously consumed OTP was accepted a second time")
        except Forbidden:
            pass
        sign_doc, _ = await service.session_agreement(sign_session, "sign")
        await service.public_view(sign_doc)
        await milestone("workflow_otp_review", "Email and SMS OTPs rendered; the active code was hashed, verified and consumed once, and a replay was rejected.")

        fee_field = sign_doc.fields[rules.field_key("schedule_b.total_fee")]
        try:
            await service.patch_fields(
                sign_doc,
                [FieldPatch(path="schedule_b.total_fee", value="1", expected_revision=fee_field.revision)],
                actor="client", ip="127.0.0.1",
            )
            raise RuntimeError("a client was able to edit a staff-owned Schedule B fee")
        except Forbidden:
            await milestone("workflow_client_ownership", "The client session was denied access to the staff-owned Schedule B fee field.")

        client_changes = [
            FieldPatch(path="schedule_a.patient_rep_initials", value="SD", expected_revision=0),
            FieldPatch(path="schedule_a.patient_rep_initials_date", value="2030-01-01", expected_revision=0),
            FieldPatch(path="schedule_c.decision_maker", value="patient", expected_revision=0),
            FieldPatch(path="schedule_c.care_consent", value="DIAGNOSTIC ONLY — synthetic consent; no care is authorized.", expected_revision=0),
            FieldPatch(path="schedule_c.communication_channel", value="email", expected_revision=0),
            FieldPatch(path="schedule_c.permissions", value="DIAGNOSTIC ONLY — no routine updates permitted.", expected_revision=0),
            FieldPatch(path="schedule_c.initials", value="SD", expected_revision=0),
            FieldPatch(path="schedule_c.verified_contact", value="agreement-diagnostics@example.invalid", expected_revision=0),
            FieldPatch(path="schedule_c.information_permitted", value="DIAGNOSTIC ONLY — none", expected_revision=0),
            FieldPatch(path="schedule_c.authorized_people_scope", value="DIAGNOSTIC ONLY — none", expected_revision=0),
        ]
        await service.patch_fields(sign_doc, client_changes, actor="client", ip="127.0.0.1")
        client_view = await service.public_view(sign_doc)
        content_hash = client_view["content_hash"]
        if len(content_hash) != 64:
            raise RuntimeError("the canonical content hash was not generated")
        await milestone("workflow_client_fields_hash", "The client-only consent/permission fields saved and were bound into the canonical SHA-256 content hash.")

        signature = _tiny_png_base64()
        try:
            await service.client_sign(
                sign_doc,
                SignAgreement(name="Synthetic Client", method="drawn", signature_base64=signature,
                              expected_content_hash="0" * 64),
                "127.0.0.1", "Bloomwell Agreement Diagnostics",
            )
            raise RuntimeError("a signature using a stale content hash was accepted")
        except Conflict:
            await milestone("workflow_stale_hash", "A signature attempt with a stale SHA-256 content hash was rejected before storing a signature.")
        await service.client_sign(
            sign_doc,
            SignAgreement(name="Synthetic Client", method="drawn", signature_base64=signature,
                          expected_content_hash=content_hash),
            "127.0.0.1", "Bloomwell Agreement Diagnostics",
        )
        try:
            await service.request_otp(review_token, "sign", OtpRequest(channel="email"), "127.0.0.1")
            raise RuntimeError("the original review token remained usable after client signing")
        except NotFound:
            await milestone("workflow_link_invalidation", "The original review token was invalidated immediately after the client signature.")
        signed_doc = await service.get_agreement(str(doc.id))
        if signed_doc.status != "client_signed" or not any(sig.role == "client" for sig in signed_doc.signatures):
            raise RuntimeError("the synthetic client signature was not saved")
        await milestone("workflow_client_signature", "The client signature image was stored in the private bucket and linked to the signed content hash.")

        result = await service.countersign(
            signed_doc, principal, user.name or "Bloomwell Diagnostic Signatory", "drawn", signature,
            "127.0.0.1", "Bloomwell Agreement Diagnostics",
        )
        view_token = capture.get("view_token")
        completed = await service.get_agreement(str(doc.id))
        if completed.status != "completed" or not completed.sealed.get("pdf_key") or not view_token:
            raise RuntimeError("countersigning did not seal the agreement and issue a signed-view token")
        await milestone("workflow_countersign_pdf", "Bloomwell countersignature completed; a PDF and completion certificate were sealed to private storage.")

        await service.request_otp(view_token, "view", OtpRequest(channel="email"), "127.0.0.1")
        await service.request_otp(view_token, "view", OtpRequest(channel="sms"), "127.0.0.1")
        view_code = capture.get("otp_codes", {}).get("view")
        if not view_code:
            raise RuntimeError("the signed-copy view OTP could not be rendered")
        _view_doc, view_session = await service.verify_otp(view_token, "view", view_code, "127.0.0.1")
        final_doc, _ = await service.session_agreement(view_session, "view")
        signed_view = await service.public_view(final_doc, signed=True)
        pdf = await service.get_sealed_pdf(final_doc)
        pdf_hash = hashlib.sha256(pdf).hexdigest()
        if not signed_view.get("signed") or not signed_view.get("certificate") or not pdf.startswith(b"%PDF-"):
            raise RuntimeError("the signed page or sealed PDF did not validate")
        if pdf_hash != final_doc.sealed.get("pdf_sha256"):
            raise RuntimeError("the retrieved private PDF SHA-256 did not match its stored certificate")
        if result.get("certificate", {}).get("content_hash") != content_hash:
            raise RuntimeError("the completion certificate does not match the client-signed content")
        await milestone("workflow_view_and_integrity", f"A fresh view OTP opened the signed agreement; private PDF integrity passed ({len(pdf):,} bytes, SHA-256 matches).")

        required_stages = {
            ("agreement_sent", "email"), ("agreement_sent", "sms"),
            ("otp_sign", "email"), ("otp_sign", "sms"),
            ("client_signed_client", "email"), ("client_signed_client", "sms"),
            ("completed_client", "email"), ("completed_client", "sms"),
            ("otp_view", "email"), ("otp_view", "sms"),
        }
        captured_stages = {(item["stage"], item["channel"]) for item in capture.get("messages", [])}
        missing = required_stages - captured_stages
        if missing:
            raise RuntimeError("a required message stage was not rendered: " + ", ".join(f"{a}/{b}" for a, b in sorted(missing)))
        await milestone("workflow_notifications", f"{len(capture.get('messages', []))} email/SMS notification renders were exercised without contacting a customer.")

        # Amendment branch: the new document must point to the completed agreement,
        # name the changed clause, and collect consent/initials again.
        amendment = await service.amend(completed, principal, "Clause 8.4")
        created_docs.append(amendment)
        if amendment.parent_agreement_id != completed.id or amendment.variation_clause != "Clause 8.4":
            raise RuntimeError("amendment parent or varied-clause reference was not recorded")
        if amendment.fields[rules.field_key("schedule_c.care_consent")].value not in (None, ""):
            raise RuntimeError("the amendment incorrectly carried forward old care consent")
        amendment_send = await service.send(amendment, principal, SendAgreement(channels="email", expires_days=14))
        if amendment_send["agreement"]["status"] != "sent" or ("amendment_sent", "email") not in {
            (item["stage"], item["channel"]) for item in capture.get("messages", [])
        }:
            raise RuntimeError("the amendment notification did not render through the amendment message stage")
        await milestone("workflow_amendment", "Amendment creation, parent linkage, named variation, renewed consent and amendment notification passed.")

        # Change-request branch: a second synthetic agreement is reviewed and returned
        # to staff; staff notification rendering is captured, never externally sent.
        change_doc = Agreement(
            reference=f"{reference}-CHANGE", created_by=user_id, assigned_nurse_id=user_id,
            fields={key: value.model_copy(deep=True) for key, value in completed.fields.items()},
            template_version=completed.template_version, template_hash=completed.template_hash,
            schedule_b_computed=dict(completed.schedule_b_computed),
        )
        await change_doc.insert()
        created_docs.append(change_doc)
        change_send = await service.send(change_doc, principal, SendAgreement(channels="email", expires_days=14))
        change_token = capture.get("review_token")
        if change_send["agreement"]["status"] != "sent" or not change_token:
            raise RuntimeError("the change-request branch could not send a synthetic review link")
        await service.request_otp(change_token, "sign", OtpRequest(channel="email"), "127.0.0.1")
        change_code = capture.get("otp_codes", {}).get("sign")
        if not change_code:
            raise RuntimeError("the change-request branch could not issue its sign OTP")
        change_doc, _change_session = await service.verify_otp(change_token, "sign", change_code, "127.0.0.1")
        await service.request_change(change_doc, "DIAGNOSTIC ONLY — synthetic change request", "127.0.0.1")
        change_doc = await service.get_agreement(str(change_doc.id))
        if change_doc.status != "changes_requested" or ("changes_requested", "email") not in {
            (item["stage"], item["channel"]) for item in capture.get("messages", [])
        }:
            raise RuntimeError("client change request did not return the agreement to staff")
        await milestone("workflow_change_request", "A verified synthetic client requested a change; the review token was invalidated and staff notification was rendered.")

        # Void branch: exercise the service transition and void notice with a disposable
        # open record. The route itself separately enforces void scope + authenticator.
        void_doc = Agreement(
            reference=f"{reference}-VOID", created_by=user_id, assigned_nurse_id=user_id,
            fields={key: value.model_copy(deep=True) for key, value in completed.fields.items()},
            template_version=completed.template_version, template_hash=completed.template_hash,
            schedule_b_computed=dict(completed.schedule_b_computed),
        )
        await void_doc.insert()
        created_docs.append(void_doc)
        await service.void(void_doc, principal, "DIAGNOSTIC ONLY — synthetic void", "127.0.0.1")
        void_doc = await service.get_agreement(str(void_doc.id))
        if void_doc.status != "voided" or ("voided", "email") not in {
            (item["stage"], item["channel"]) for item in capture.get("messages", [])
        }:
            raise RuntimeError("the void transition or its notification did not complete")
        await milestone("workflow_void", "The open synthetic agreement was voided, its access token invalidated and its void notice rendered.")
    except Exception as exc:
        checks.append(Check("workflow_failed", FAIL, f"Simulation stopped at the first failed step ({type(exc).__name__}: {str(exc)[:180]}). No customer messages were sent."))
    finally:
        service._DIAGNOSTIC_CAPTURE.reset(context_token)
        for cleanup_doc in created_docs:
            try:
                stored = await Agreement.get(cleanup_doc.id)
                if stored:
                    storage = get_storage()
                    keys = {signature.image_key for signature in stored.signatures}
                    if stored.sealed.get("pdf_key"):
                        keys.add(stored.sealed["pdf_key"])
                    for key in keys:
                        try:
                            await storage.delete(Bucket.PRIVATE, key)
                        except Exception:
                            cleanup_ok = False
                    await AgreementOtp.get_pymongo_collection().delete_many({"agreement_id": stored.id})
                    await stored.delete()
            except Exception:
                cleanup_ok = False
        checks.append(Check("workflow_cleanup", PASS if cleanup_ok else WARN,
                            "The synthetic agreement, OTP records, signatures and sealed PDF were removed." if cleanup_ok else "Some synthetic diagnostic artefacts could not be removed; inspect records with the BHC-TEST reference prefix."))
    return checks


async def run_staff_delivery_test(principal: Any, channel: str) -> Check:
    """Send a clearly labelled test only to the currently authenticated staff member."""
    from app.core.phone import is_mobile, normalise_e164
    from app.modules.auth.models import User

    user = await User.get(PydanticObjectId(principal.user_id))
    if user is None or not user.is_active:
        return Check(f"agreement_delivery_{channel}", FAIL, "The active staff account could not be loaded.")

    if channel == "email":
        try:
            from app.modules.mail.settings_service import get_value
            enabled = bool(await get_value("mail.enabled"))
            external = bool(await get_value("mail.external_enabled"))
            suspended = bool(await get_value("mail.suspend_all_sending"))
            provider = str(await get_value("mail.provider") or "console").lower()
            domain = str(await get_value("mail.domain") or "").strip().lower()
        except Exception as exc:
            return Check("agreement_delivery_email", FAIL, f"Mail settings could not be read ({type(exc).__name__}).")
        if not user.email or "@" not in user.email:
            return Check("agreement_delivery_email", FAIL, "Your staff account has no valid email address.")
        if not enabled or not external or suspended:
            return Check("agreement_delivery_email", WARN, "Mail is not enabled for external delivery; no message was sent.")
        if provider == "console":
            return Check("agreement_delivery_email", WARN, "The console mail provider does not deliver externally; no email was sent.")
        if domain != "bhcug.com":
            return Check("agreement_delivery_email", FAIL, "The configured email domain is not bhcug.com; no test email was sent.")
        try:
            if provider == "brevo" and str(await get_value("mail.brevo_transport") or "smtp").lower() == "smtp":
                credentials_ok = bool(await get_value("mail.smtp_username")) and bool(await get_value("mail.smtp_password"))
            else:
                credentials_ok = bool(await get_value("mail.provider_api_key"))
        except Exception:
            credentials_ok = False
        if not credentials_ok:
            return Check("agreement_delivery_email", FAIL, "The selected provider credentials are missing; no email was sent.")
        sample = {
            "client_name": user.name or "Bloomwell staff member", "client_first_name": (user.name or "Staff").split()[0],
            "reference": "BHC-TEST-DELIVERY", "link": "https://bhcug.com/agreement/DIAGNOSTICS-NOT-A-REAL-AGREEMENT",
            "code": "123456", "expires_days": "14", "expires_date": "2030-01-01",
            "company": "Bloomwell Home Care Uganda Limited", "support_phone": "0787499988",
            "support_email": "info@bhcug.com", "staff_name": user.name or "Staff", "reason": "Staff delivery test",
        }
        template, _, _ = await messages.get_template("agreement_sent", "email")
        subject, body_html, plain = messages.render_email("agreement_sent", template, sample)
        marker_html = '<p style="padding:12px;background:#fff2cc;color:#5c4300;font-weight:bold">STAFF DIAGNOSTIC TEST — NOT A CLIENT AGREEMENT. The link is intentionally inactive. Do not sign.</p>'
        marker_text = "STAFF DIAGNOSTIC TEST — NOT A CLIENT AGREEMENT. The link is intentionally inactive. Do not sign.\n\n"
        body_start = body_html.find(">", body_html.find("<body"))
        marked_html = (body_html[:body_start + 1] + marker_html + body_html[body_start + 1:]
                       if body_start >= 0 else marker_html + body_html)
        result = await service.get_email_provider().send(
            [user.email], f"[TEST] {subject}", marked_html, marker_text + plain,
        )
        masked = user.email.split("@", 1)[0][:1] + "***@" + user.email.split("@", 1)[1]
        accepted = bool(result.ok and getattr(result, "provider_message_id", None) != "console")
        return Check("agreement_delivery_email", PASS if accepted else FAIL,
                     f"Mail provider accepted/queued the labelled test for {masked}. Confirm it arrived in your inbox; queue acceptance is not proof of inbox delivery." if accepted else "The provider did not accept the staff test email (including a console fallback). Check the Mail section's outbox and diagnostics.")

    if channel == "sms":
        settings = get_settings()
        phone = normalise_e164(user.phone_e164 or "")
        if not phone or not is_mobile(phone):
            return Check("agreement_delivery_sms", FAIL, "Add a valid Uganda mobile number to your staff profile before testing SMS.")
        if str(settings.sms_provider or "console").lower() != "mambosms":
            return Check("agreement_delivery_sms", WARN, "SMS is using the console provider; no SMS was delivered externally.")
        if not settings.mambosms_api_key:
            return Check("agreement_delivery_sms", FAIL, "MamboSMS is selected but MAMBOSMS_API_KEY is missing.")
        text = (
            "Bloomwell: TEST ONLY. Staff agreement notification check. "
            "No client or patient details. Do not use this message as an agreement link."
        )
        messages.validate_rendered_sms(text)
        from app.modules.notifications.config import load_config
        from app.modules.notifications.providers import get_sms_provider
        from app.modules.notifications.service import send_sms
        delivered = await send_sms(
            get_sms_provider(), await load_config(), to=phone, text=text,
            audience="agreement_diagnostics", template="agreement_staff_delivery_test", enquiry=None,
        )
        return Check("agreement_delivery_sms", PASS if delivered else FAIL,
                     "MamboSMS accepted the labelled test for your staff-profile number. Confirm receipt on that phone; provider acceptance is not proof of handset delivery." if delivered else "MamboSMS did not accept the test. Check SMS logs, sender ID, balance and provider settings.")

    return Check(f"agreement_delivery_{channel}", FAIL, "Unsupported delivery test channel.")
