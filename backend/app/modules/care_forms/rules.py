"""Pure rules for care forms (no database). Server-side source of truth for the gates in IMPLEMENT.md rule 9."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.core.email_layout import render_branded_email

FORM_IDS = tuple(f"{i:02d}" for i in range(1, 13))
CLIENT_FORMS = frozenset({"03", "04", "05", "06", "11", "12"})
OPTIONAL_CLIENT_FORMS = frozenset({"07"})
NURSE_ONLY = frozenset({"01", "02", "08", "09", "10", "tracker"}) | (frozenset(FORM_IDS) - CLIENT_FORMS - OPTIONAL_CLIENT_FORMS)
CLIENT_ROLES = ("client", "representative", "interpreter", "witness")
CLIENT_METHODS = ("drawn", "biometric", "password", "thumbprint")  # "password" = passphrase set by the signer
NURSE_METHODS = ("drawn", "biometric", "password")  # "password" = the nurse's account password
FEVER_C = 37.5
LOW_BABY_C = 36.5


class RuleError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def needs_client_signature(form_id: str) -> bool:
    return form_id in CLIENT_FORMS


def tracker_allowed(patient_type: str | None, kind: str | None = None) -> bool:
    """Mama tracker only for Mama, Baby tracker only for Baby, none for General."""
    if patient_type not in ("Mama", "Baby"):
        return False
    return kind is None or kind.lower() == patient_type.lower()


def validate_client_signature(role: str, method: str, *, esign_consent: bool, name: str, detail: dict[str, Any], evidence: dict[str, Any], has_image: bool) -> None:
    if role not in CLIENT_ROLES:
        raise RuleError("bad_role", "Unknown signing role.")
    if method not in CLIENT_METHODS:
        raise RuleError("bad_method", "Unknown signing method.")
    if not esign_consent:
        raise RuleError("esign_consent_required", "Tick the box to agree to sign electronically.")
    if not (name or "").strip():
        raise RuleError("name_required", "Signer name is required.")
    if role == "representative" and not str(detail.get("authority", "")).strip():
        raise RuleError("authority_required", "Record the representative's authority.")
    if method in ("drawn", "thumbprint") and not has_image:
        raise RuleError("signature_image_required", "A drawn signature or thumbprint image is required.")
    if method in ("biometric", "password") and not evidence:
        raise RuleError("evidence_required", "Verification evidence is required for this method.")
    if method == "thumbprint":
        missing = [k for k in ("interpreter_name", "interpreter_address", "interpreter_language") if not str(detail.get(k, "")).strip()]
        if missing or not detail.get("interpreter_signed"):
            raise RuleError("interpreter_required", "A thumbprint needs the interpreter or reader's name, address, language and signature.")


def validate_nurse_signature(method: str, *, evidence: dict[str, Any], has_image: bool) -> None:
    if method not in NURSE_METHODS:
        raise RuleError("bad_method", "Nurses sign by drawing, fingerprint/face or account password.")
    if method == "drawn" and not has_image:
        raise RuleError("signature_image_required", "A drawn signature is required.")
    if method != "drawn" and not evidence:
        raise RuleError("evidence_required", "Verification evidence is required for this method.")


def arrive_blocked(signed_form_ids: set[str]) -> bool:
    """Arrive is blocked until Form 03 is signed (emergencies go on Form 10)."""
    return "03" not in signed_form_ids


def abnormal_temp(value: Any, *, baby: bool = False) -> bool:
    try:
        t = float(value)
    except (TypeError, ValueError):
        return False
    return t > FEVER_C or (baby and t < LOW_BABY_C)


def visit_sign_blocked(entries: list[dict[str, Any]], *, has_form_10: bool, baby: bool = False) -> bool:
    """entries: [{'temp': .., 'action': ..}] for the visit. Abnormal temperature needs an action entry or Form 10."""
    if has_form_10:
        return False
    return any(abnormal_temp(e.get("temp"), baby=baby) and not str(e.get("action", "")).strip() for e in entries)


def form_08_nurse_patch(data: dict[str, Any]) -> dict[str, Any]:
    """Form 08 orders are read-only for nurses: only Given / Not given and a reason can be recorded."""
    allowed = {"given", "reason"}
    bad = set(data) - allowed
    if bad:
        raise RuleError("orders_read_only", "Orders are set by supervisors. Record Given or Not given and a reason only.")
    if data.get("given") is False and not str(data.get("reason", "")).strip():
        raise RuleError("reason_required", "Give a reason when an order is not given.")
    return data


def copy_recipient(*, auto_on: bool, client_consented: bool, signer_role: str, signer_email: str | None, client_email: str | None) -> str | None:
    """Rule 7 truth table. Returns the address to email, or None (paper copy / no email)."""
    if not (auto_on and client_consented):
        return None
    if signer_role == "client":
        addr = client_email
    elif signer_role == "representative":
        addr = signer_email
    else:
        return None
    addr = (addr or "").strip()
    return addr if "@" in addr else None


def unmc_expired(expiry: date | None, today: date | None = None) -> bool:
    return bool(expiry and expiry < (today or date.today()))


COPY_SUBJECT = "Your signed document from Bloomwell Home Care"
_COPY_INTRO = "Your signed document is attached. It is confidential. If you did not expect it, please tell us at the privacy address on the document."
COPY_HTML, COPY_PLAIN = render_branded_email(
    heading="Your signed document",
    paragraphs=_COPY_INTRO,
    preheader="A signed copy is attached to this email.",
    footer_reason="You received this because a signed document was shared with you.",
)


def form_08_values(data: dict[str, Any]) -> dict[str, Any]:
    """Template values for Form 08: the supervisor's order (v keys) plus administrations laid into the 10-row grid (t_r{n}c{0-5})."""
    out = dict(data.get("orders") or {})
    for n, a in enumerate((data.get("administrations") or [])[:10], start=1):
        code = "Given" if a.get("given") else (a.get("code") or "Not given")
        for c, val in enumerate((a.get("due", ""), a.get("at", ""), a.get("dose_route", ""), code, a.get("initials", ""), a.get("reason", ""))):
            out[f"t_r{n}c{c}"] = val
    return out
