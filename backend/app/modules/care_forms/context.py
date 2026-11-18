"""Builds the data each care-form template needs from the nurse profile, the patient record and organisation settings.

Nothing here is typed in by the nurse: UNMC details come from the nurse profile, contact details from the patient record,
sender and contact details from the organisation / mail settings. Field names that do not exist yet in the current models
are marked NEW (see the care forms spec).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

PATIENT_TYPES = ("Mama", "Baby", "General")  # NEW: CareClient.patient_type, set in admin


class MissingProfileField(ValueError):
    """Raised when a required profile value is missing, so the form cannot be signed or rendered.

    `action` tells the nurse app what to show: "open_profile" means a prompt linking to Profile, not a hard error.
    """
    action = "open_profile"


def _af(agreement: Any, path: str) -> str:
    """Value of one agreement field. Works on the Agreement document or a plain dict.

    Agreement.fields is keyed by the field path with "." replaced by "__" (e.g. "client__email"), each an AgreementField
    with a .value. A plain {"client.email": "..."} or {"client__email": {"value": "..."}} dict is also accepted (tests).
    """
    fields = agreement.get("fields", agreement) if isinstance(agreement, dict) else agreement.fields
    f = fields.get(path.replace(".", "__"), fields.get(path))
    v = f.get("value") if isinstance(f, dict) else getattr(f, "value", f)
    return "" if v is None else str(v).strip()


def patient_from_agreement(client: dict, agreement: Any, patient_type: str = "General", overrides: dict | None = None) -> dict[str, Any]:
    """Patient record for the forms, read from the client's agreement (Schedule A and Parties), not from new CareClient fields.

    client: id, display_name (CareClient). agreement: the Agreement document linked to that client (see the care forms spec,
    CareClient needs an agreement link). patient_type is the one value the agreement lacks; admin sets it. overrides:
    corrections made by admin or the nurse; they win, and the agreement itself is never changed.
    Phone and email are the *client's* (client.phone, client.email), which may be a relative rather than the patient.
    """
    a = lambda path: _af(agreement, path)  # noqa: E731
    base = {
        "name": a("patient.full_name") or client.get("display_name", ""), "record_id": client.get("id", ""), "type": patient_type,
        # patient.* is the current location; schedule_a.* only exists on older agreements
        "dob": a("patient.dob_or_age") or a("schedule_a.patient_dob_or_age"),
        "language": a("patient.language") or a("schedule_a.language"),
        "phone": a("client.phone"), "email": a("client.email"),
        "address": a("schedule_a.service_address") or a("client.address"), "directions": a("schedule_a.directions"),
        "client_contact": a("schedule_a.client_contact"),
        # one free-text field ("name, relationship and phone"), so it is not split into parts
        "caregiver": {}, "emergency": {"text": a("schedule_a.emergency_contact")},
        "practitioner": a("schedule_a.treating_practitioner"), "facility": a("schedule_a.preferred_receiving_facility"),
        "allergies": a("schedule_a.allergies"), "agreement_ref": getattr(agreement, "reference", "") if not isinstance(agreement, dict) else agreement.get("reference", ""),
    }
    for k, v in (overrides or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = {**base[k], **{kk: vv for kk, vv in v.items() if vv}}
        elif v not in (None, ""):
            base[k] = v
    return base


def slug(label: str) -> str:  # must match generators/gen_forms.py
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:40]


def nice(d: Any) -> str:
    if isinstance(d, (date, datetime)):
        return f"{d.day} {d.strftime('%b %Y')}"
    return "" if d is None else str(d)


def registration_line(user: dict[str, Any], today: date | None = None) -> str:
    """Line printed under every clinician signature, from the nurse profile.

    Store the returned text on the signature row when signing (UNMC line "as signed"), and print that stored text on the PDF,
    so a later profile edit never changes an old document. UNMC details are optional when the account is created and stay
    self-declared until a different admin verifies them; signing needs a number and an unexpired licence.

    user: name, unmc_number (NEW), unmc_category (NEW, e.g. 'Registered nurse'), unmc_licence_expiry (NEW, date).
    """
    today = today or date.today()
    number = (user.get("unmc_number") or "").strip()
    if not number:
        raise MissingProfileField("Add your UNMC number to your profile before signing.")
    expiry = user.get("unmc_licence_expiry")
    if not isinstance(expiry, date):
        raise MissingProfileField("Add your UNMC practising licence expiry date to your profile before signing.")
    if expiry < today:
        raise MissingProfileField("Your UNMC practising licence has expired. Update your profile.")
    parts = [f"UNMC {number}", user.get("unmc_category") or "", f"licence valid to {nice(expiry)}" if expiry else ""]
    return " · ".join(p for p in parts if p)


def prefill(form_id: str, patient: dict, author: dict, org: dict, copy: dict | None) -> dict[str, str]:
    """Default values for fields that already exist elsewhere in the system. Anything the nurse saves overrides these."""
    p, c, e = patient, patient.get("caregiver", {}), patient.get("emergency", {})
    reg = author["registration_line"]
    m: dict[str, dict[str, str]] = {
        "01": {
            "Patient telephone": p.get("phone", ""), "Preferred language": p.get("language", ""),
            "Home / service address and directions": "\n".join(x for x in (p.get("address", ""), p.get("directions", "")) if x),
            "Communication / accessibility support required": p.get("accessibility", ""),
            "Primary caregiver": c.get("name", ""), "Caregiver relationship": c.get("relationship", ""),
            "Caregiver telephone": c.get("phone", ""), "Available care hours": c.get("hours", ""),
            "Emergency contact": e.get("name") or e.get("text", ""), "Emergency contact relationship": e.get("relationship", ""),
            "Emergency contact telephone": e.get("phone", ""), "Alternative contact": p.get("alt_contact", ""),
            "Payer / client name and Service Agreement reference": p.get("agreement_ref", ""),
            "Referring clinician / facility and contact": " · ".join(x for x in (p.get("practitioner", ""), p.get("facility", "")) if x),
        },
        "03": {"Decision-specific capacity assessed by": author["name"]},
        "05": {"Personal Data Protection Office registration reference (if applicable)": org.get("pdpo_ref", ""),
               "Verified number / email": p.get("email", "") or p.get("phone", "")},
        "06": {"Lead clinician": author["name"]},
        "07": {"Nurse name / UNMC number": f"{author['name']} · {reg}", "Location": p.get("address", "")},
        "09": {"Responsible clinician": author["name"]},
    }
    if copy:
        m.setdefault("03", {}).update({"Copy given on": nice(copy.get("sent_at")),
                                      "Sent by (auto-email / paper)": copy.get("channel", ""),
                                      "Sent to (email)": copy.get("to", "")})
    return {slug(k): v for k, v in m.get(form_id, {}).items()}


def build_context(form_id: str, *, patient: dict, author: dict, org: dict, values: dict | None = None,
                  signatures: dict | None = None, form: dict | None = None, copy: dict | None = None) -> dict[str, Any]:
    """patient: name, dob, record_id, type, phone, email, language, address, caregiver{}, emergency{}.
    author: the signed-in nurse or staff user (name + UNMC fields). org: name, short_name, city, phone, privacy_email, pdpo_ref, mark_svg.
    """
    author = {**author, "registration_line": registration_line(author)}
    return {"patient": patient, "author": author, "org": org, "form": form or {},
            "v": values or {}, "prefill": prefill(form_id, patient, author, org, copy),
            "sig": signatures or {r: {} for r in ("client", "interpreter", "witness", "nurse", "staff", "receiver")},
            "copy": copy or {}}


# ---------------------------------------------------------------- weekly trackers

DAY = "%a %-d"
BABY_KEYS = ["temp", "fed", "bathed", "massage_oil", "sleep", "nappy"]
MAMA_KEYS = ["temp", "pain", "breast", "bleeding", "meals_water", "sleep_mood"]
CARE_LABELS = [("tea", "Tea therapy taken (time)"), ("counselling", "Psychotherapy / counselling"),
               ("massage", "Massage / oils (oil used)"), ("breastfeeding", "Breastfeeding help / latching"),
               ("help_home", "Help at home / hours rested")]


def tracker_context(kind: str, week_start: date, *, patient: dict, partner: dict, author: dict, org: dict,
                    entries: list[dict], care: dict[date, dict] | None = None, notes: list[dict] | None = None,
                    signature: dict | None = None, today: date | None = None) -> dict[str, Any]:
    """kind: 'baby' or 'mama'. entries: [{date, slot: 'AM'|'PM', values: {...}, initials}]. Always 14 rows, filled or blank."""
    if patient.get("type") != {"baby": "Baby", "mama": "Mama"}[kind]:
        raise ValueError(f"The {kind} tracker is only for patients set as {kind.title()} by admin.")
    keys = BABY_KEYS if kind == "baby" else MAMA_KEYS
    days = [week_start + timedelta(days=i) for i in range(7)]
    by = {(e["date"], e["slot"]): e for e in entries}
    rows = []
    for d in days:
        for slot in ("AM", "PM"):
            e = by.get((d, slot))
            cells = [str((e or {}).get("values", {}).get(k, "")) for k in keys] + [(e or {}).get("initials", "")]
            rows.append({"day": d.strftime(DAY), "slot": slot, "cells": cells, "filled": e is not None,
                         "highlight": e is not None})
    care = care or {}
    care_rows = [{"label": lab, "cells": [str(care.get(d, {}).get(k, "")) for d in days]} for k, lab in CARE_LABELS]
    end = days[-1]
    return {"patient": patient, "partner": partner, "org": org, "author": {**author, "registration_line": registration_line(author)},
            "week": {"label": f"{days[0].strftime('%a %-d %b')} to {end.strftime('%a %-d %b %Y')}", "days": [d.strftime(DAY) for d in days]},
            "rows": rows, "care_rows": care_rows,
            "notes": [{"day": n["date"].strftime(DAY), "text": n["text"]} for n in (notes or [])],
            "signature": signature or {}}
