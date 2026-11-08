from __future__ import annotations

import hashlib
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from app.modules.agreements.models import AgreementField

# Explicit server-side ownership. The browser is never the source of truth for ownership.
FIELD_OWNERS: dict[str, str] = {
    "client.name": "either", "client.title": "either", "client.address": "either",
    "client.phone": "either", "client.email": "either", "client.relationship_to_patient": "either",
    "patient.full_name": "either", "patient.dob_or_age": "either", "patient.language": "either",
    "schedule_a.assessment_date": "clinical",
    "schedule_a.patient_dob_or_age": "either", "schedule_a.language": "either",
    "schedule_a.service_address": "either", "schedule_a.directions": "either",
    "schedule_a.emergency_contact": "either", "schedule_a.treating_practitioner": "either",
    "schedule_a.preferred_receiving_facility": "either",
    "schedule_a.care_start_date": "clinical", "schedule_a.care_end_review_date": "clinical",
    "schedule_a.visit_dates_frequency": "clinical", "schedule_a.shift_start_end_times": "clinical",
    "schedule_a.coverage_arrangement": "clinical", "schedule_a.relief_cover_family_attendance": "clinical",
    "schedule_a.care_plan": "clinical", "schedule_a.tasks_included": "clinical",
    "schedule_a.tasks_excluded": "clinical", "schedule_a.medicines_clinical_orders": "clinical",
    "schedule_a.equipment_supplies": "clinical", "schedule_a.safety_emergency_plan": "clinical",
    "schedule_a.clinical_lead": "clinical", "schedule_a.registration_number": "clinical",
    "schedule_a.additional_care_sheets": "clinical", "schedule_a.clinical_approval": "clinical",
    "schedule_a.patient_rep_initials": "client", "schedule_a.patient_rep_initials_date": "client",
    "schedule_b.fees": "staff", "schedule_b.rates": "staff", "schedule_b.start_date": "staff",
    "schedule_b.end_date": "staff", "schedule_b.payment_details": "staff",
    "schedule_b.assessment_fee": "staff", "schedule_b.nursing_visit_shift": "staff",
    "schedule_b.number_visits_shifts": "staff", "schedule_b.transport": "staff",
    "schedule_b.dressings_consumables": "staff", "schedule_b.equipment_hire_deposit": "staff",
    "schedule_b.overtime_extra_visit": "staff", "schedule_b.tax_treatment": "staff",
    "schedule_b.price_basis": "staff", "schedule_b.advance_due_date": "staff",
    "schedule_b.balance_due_dates": "staff", "schedule_b.late_cancellation_charge": "staff",
    "schedule_b.total_fee": "staff", "schedule_b.currency": "staff",
    "schedule_b.other_costs_exclusions": "staff", "schedule_b.payment_account_name": "staff",
    "schedule_b.payment_provider_account_number": "staff", "schedule_b.repayment_recipient_method": "staff",
    "schedule_b.bloomwell_insurance_details": "staff", "schedule_b.agreed_variations": "staff",
    "schedule_b.organisation_payer_name": "either", "schedule_b.organisation_registration_number": "either",
    "schedule_b.organisation_payer_address": "either", "schedule_b.organisation_signatory_name": "either",
    "schedule_b.organisation_signatory_role": "either", "schedule_b.organisation_signatory_authority": "either",
    "schedule_b.insurance_external_payer_reference": "either", "schedule_b.organisation_payer_contact": "either",
    "schedule_b.client_billing_address_email": "either",
    "schedule_c.decision_maker": "client", "schedule_c.representative_name": "client",
    "schedule_c.representative_relationship": "client", "schedule_c.authority_basis": "client",
    "schedule_c.care_consent": "client", "schedule_c.communication_channel": "client",
    "schedule_c.permissions": "client", "schedule_c.initials": "client",
    "schedule_c.verified_contact": "client", "schedule_c.information_permitted": "client",
    "schedule_c.authorized_people_scope": "client", "schedule_c.other_channel_details": "client",
    "schedule_c.bloomwell_verification_by": "staff", "schedule_c.consent_obtained_by": "staff",
    # Added with template v2 so every fillable blank in the agreement has a field.
    "schedule_a.client_contact": "either", "schedule_a.allergies": "clinical",
    "schedule_a.client_supplies": "clinical", "schedule_a.required_caregiver_presence": "clinical",
    "schedule_a.clinical_lead_contact": "clinical",
    "schedule_b.assessment_fee_basis": "staff", "schedule_b.bloomwell_signatory": "staff",
    "schedule_c.witness_name_contact": "either",
    # Added with template v3: the labelled cells of the Schedule B fee table that had no field.
    "schedule_b.price_type": "staff", "schedule_b.transport_basis": "staff",
    "schedule_b.consumables_items": "staff", "schedule_b.equipment_inventory_ref": "staff",
    "schedule_b.overtime_approval": "staff",
}

# Fields answered by choosing one option. These are the tick boxes and pick-lists of the agreement;
# the document ticks exactly the chosen option. Older free-text answers stay readable (see choice_error).
CHOICE_FIELDS: dict[str, tuple[str, ...]] = {
    "schedule_a.coverage_arrangement": ("Scheduled visits", "Day shifts", "Night shifts", "Continuous care by roster"),
    "schedule_b.currency": ("UGX", "USD"),
    "schedule_b.price_basis": ("Per visit", "Per shift", "Per day", "Per week", "Fixed package total"),
    "schedule_b.price_type": ("Fixed", "Estimate"),
    "schedule_b.transport_basis": ("Included", "Additional"),
    "schedule_b.overtime_approval": ("Yes", "No"),
    "schedule_b.tax_treatment": ("Inclusive", "Exempt", "Additional"),
    "schedule_c.decision_maker": ("Patient with capacity", "Parent/Guardian", "Other lawful representative"),
    "schedule_c.care_consent": ("Consent given", "Consent given with conditions"),
    "schedule_c.communication_channel": ("Telephone", "SMS", "Email", "WhatsApp", "Other"),
    "schedule_c.information_permitted": ("Booking / billing only", "Agreed care updates", "Other"),
}
# The server or the signing check needs a real answer for these, so "N/A" is not accepted.
CHOICE_REQUIRES_ANSWER = frozenset({
    "schedule_b.currency", "schedule_c.decision_maker", "schedule_c.care_consent",
    "schedule_c.communication_channel", "schedule_c.information_permitted",
})


def choice_error(path: str, value: Any, current: Any = None) -> str | None:
    """Why this answer is not one of the field's options, or None when it is acceptable.

    Blank clears the field and "N/A" is accepted where the field may be not applicable. Re-saving the answer
    already stored is always accepted, so an agreement drafted before the options existed can still be edited.
    """
    options = CHOICE_FIELDS.get(path)
    if options is None or value is None:
        return None
    text = str(value).strip()
    if not text or text == (str(current).strip() if current is not None else None):
        return None
    if text.upper() == "N/A":
        return "Choose one of the listed options." if path in CHOICE_REQUIRES_ANSWER else None
    if text not in options:
        return f"Choose one of: {', '.join(options)}."
    return None


_SUBCLAUSE_COUNTS = {
    1: 5, 2: 3, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 8,
    9: 4, 10: 4, 11: 3, 12: 5, 13: 4, 14: 3, 15: 5,
}
REQUIRED_TEMPLATE_SECTIONS = frozenset({
    *(f"{number}.0" for number in range(1, 16)),
    *(f"{major}.{minor}" for major, count in _SUBCLAUSE_COUNTS.items()
      for minor in range(1, count + 1)),
    "Schedule A", "Schedule B", "Schedule C",
})


def validate_template_sections(clauses: dict[str, str]) -> None:
    """Require the full plan-defined clause and schedule set before publication."""
    missing = sorted(REQUIRED_TEMPLATE_SECTIONS - set(clauses))
    if missing:
        raise ValueError(f"Missing required agreement sections: {', '.join(missing)}")
    if any(not isinstance(text, str) or not text.strip() for text in clauses.values()):
        raise ValueError("Every agreement section must contain non-empty source wording")


def field_key(path: str) -> str:
    """Mongo-safe field key; MongoDB does not support periods in BSON document keys."""
    return path.replace(".", "__")


def field_path(key: str) -> str:
    return key.replace("__", ".")


def initial_fields() -> dict[str, AgreementField]:
    return {
        field_key(path): AgreementField(value=None, owner=owner)
        for path, owner in FIELD_OWNERS.items()
    }


def missing_signing_consent(fields: dict[str, AgreementField]) -> list[str]:
    """Return Schedule A/C client fields that must be completed before signing."""
    required = (
        "schedule_a.patient_rep_initials", "schedule_a.patient_rep_initials_date",
        "schedule_c.decision_maker", "schedule_c.care_consent", "schedule_c.initials",
        "schedule_c.communication_channel", "schedule_c.permissions", "schedule_c.verified_contact",
        "schedule_c.information_permitted", "schedule_c.authorized_people_scope",
    )
    missing = [path for path in required
               if not fields.get(field_key(path)) or fields[field_key(path)].value in (None, "", [])]
    decision_field = fields.get(field_key("schedule_c.decision_maker"))
    decision = str(decision_field.value or "").strip().lower() if decision_field else ""
    # Any decision-maker other than the patient personally must be supported by
    # the representative's identity, relationship and lawful authority details.
    if decision and "patient" not in decision:
        for path in ("schedule_c.representative_name", "schedule_c.representative_relationship",
                     "schedule_c.authority_basis"):
            field = fields.get(field_key(path))
            if field is None or field.value in (None, "", []):
                missing.append(path)
    return missing


def missing_staff_fields(fields: dict[str, AgreementField]) -> list[str]:
    """All staff/clinical-owned schedule entries must be filled or marked N/A before send."""
    missing: list[str] = []
    for path, owner in FIELD_OWNERS.items():
        if owner not in {"staff", "clinical"}:
            continue
        field = fields.get(field_key(path))
        if field is None or field.value in (None, "", []):
            missing.append(path)
    return missing


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str, allow_nan=False).encode("utf-8")


def canonical_hash(fields: dict[str, AgreementField], template_version: int, template_hash: str) -> str:
    values = {
        field_path(key): {
            "value": field.value,
            "owner": field.owner,
            "revision": field.revision,
            "entered_by_staff": field.entered_by_staff,
        }
        for key, field in sorted(fields.items())
    }
    return hashlib.sha256(canonical_json({
        "fields": values,
        "template_version": template_version,
        "template_hash": template_hash,
    })).hexdigest()


def calculate_fees(total_fee: Any, currency: str = "UGX", booking_fee: int = 50_000) -> dict[str, Any]:
    """Calculate the separate UGX booking fee and the service-fee 50/50 split.

    Clauses 8.2 and 8.4 make the UGX 50,000 booking fee additional to the service
    fees. It must NOT be included in the 50% advance or remaining 50% balance.
    No foreign-exchange conversion is inferred when service fees are in USD.
    """
    if currency not in {"UGX", "USD"}:
        raise ValueError("currency must be UGX or USD")
    try:
        care = Decimal(str(total_fee if total_fee not in (None, "") else "0"))
        booking = Decimal(str(booking_fee))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("fee values must be valid numbers") from exc
    if care < 0 or booking < 0:
        raise ValueError("fee values cannot be negative")
    service_total = care.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    booking_total = booking.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    advance = (service_total / 2).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    balance = service_total - advance
    return {
        "booking_fee": float(booking_total),
        "booking_fee_currency": "UGX",
        "booking_fee_is_additional": True,
        "care_fee": float(service_total),
        "total_service_fees": float(service_total),
        # `total` is retained for API compatibility and means service fees only.
        "total": float(service_total),
        "advance": float(advance),
        "balance": float(balance),
        "currency": currency,
        # Avoid adding UGX and USD amounts together without an agreed exchange rate.
        "total_payable_if_ugx": float(service_total + booking_total) if currency == "UGX" else None,
    }


def validate_patch(path: str, owner: str, actor: str, entered_by_staff: bool) -> None:
    expected = FIELD_OWNERS.get(path)
    if expected is None:
        raise ValueError("Unknown agreement field")
    if owner != expected:
        raise ValueError("Stored field ownership does not match the field registry")
    if actor == "client" and expected not in {"client", "either"}:
        raise PermissionError("This field is read-only")
    if actor == "staff" and expected == "client":
        raise PermissionError("This field is reserved for the client or lawful representative")
    if actor == "staff" and expected == "clinical":
        # The service performs assignment-based clinical authorization separately.
        return
    if entered_by_staff and (actor != "staff" or expected != "either"):
        raise PermissionError("Only an 'either' field may be entered by staff on behalf of a client")


def template_hash(clauses: dict[str, str], blocks: list[dict[str, Any]] | None = None) -> str:
    """Hash of the wording. A block template hashes clauses and layout together so neither can change silently."""
    if blocks:
        return hashlib.sha256(canonical_json({"clauses": clauses, "blocks": blocks})).hexdigest()
    return hashlib.sha256(canonical_json(clauses)).hexdigest()


# Agreements that were never sent, or are already closed, can be deleted outright.
DELETABLE_STATUSES = frozenset({"draft", "changes_requested", "expired", "voided"})


def deletion_block_reason(status: str) -> str | None:
    """Why an agreement in this status cannot be deleted yet, or None when it can."""
    if status in DELETABLE_STATUSES:
        return None
    if status == "completed":
        return "A completed agreement is a signed legal record and cannot be deleted. Create an amendment instead."
    if status in {"sent", "client_in_progress"}:
        return "This agreement is with the client. Void it first so the client is told and the link is closed, then delete it."
    if status == "client_signed":
        return "The client has already signed. Void it first if it must be removed, then delete it."
    return "This agreement cannot be deleted in its current status."
