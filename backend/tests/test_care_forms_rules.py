import pytest

from app.modules.care_forms import rules


@pytest.mark.parametrize("ptype,kind,ok", [("Mama", "mama", True), ("Mama", "baby", False), ("Baby", "baby", True), ("Baby", "mama", False), ("General", None, False), (None, None, False)])
def test_tracker_only_for_matching_patient_type(ptype, kind, ok):
    assert rules.tracker_allowed(ptype, kind) is ok


def test_client_vs_nurse_only_forms():
    assert all(rules.needs_client_signature(f) for f in ("03", "04", "05", "06", "11", "12"))
    assert not any(rules.needs_client_signature(f) for f in ("01", "02", "08", "09", "10", "tracker", "07"))


def _client(**kw):
    base = dict(role="client", method="drawn", esign_consent=True, name="Mary", detail={}, evidence={}, has_image=True)
    return {**base, **kw}


def test_client_signature_requirements():
    rules.validate_client_signature(**_client())
    for bad, code in [({"esign_consent": False}, "esign_consent_required"), ({"role": "representative"}, "authority_required"),
                      ({"has_image": False}, "signature_image_required"), ({"method": "password"}, "evidence_required"), ({"role": "boss"}, "bad_role")]:
        with pytest.raises(rules.RuleError) as e:
            rules.validate_client_signature(**_client(**bad))
        assert e.value.code == code


def test_thumbprint_needs_interpreter_details():
    with pytest.raises(rules.RuleError):
        rules.validate_client_signature(**_client(method="thumbprint"))
    full = {"interpreter_name": "A", "interpreter_address": "B", "interpreter_language": "Luganda", "interpreter_signed": True}
    rules.validate_client_signature(**_client(method="thumbprint", detail=full))


def test_nurse_methods():
    rules.validate_nurse_signature("password", evidence={"ok": 1}, has_image=False)
    with pytest.raises(rules.RuleError):
        rules.validate_nurse_signature("thumbprint", evidence={"x": 1}, has_image=True)


def test_arrive_blocked_until_form_03_signed():
    assert rules.arrive_blocked(set()) and rules.arrive_blocked({"05"})
    assert not rules.arrive_blocked({"03"})


def test_temperature_gate():
    hot = [{"temp": "38.1", "action": ""}]
    assert rules.visit_sign_blocked(hot, has_form_10=False)
    assert not rules.visit_sign_blocked([{"temp": "38.1", "action": "Paracetamol, called supervisor"}], has_form_10=False)
    assert not rules.visit_sign_blocked(hot, has_form_10=True)
    assert not rules.visit_sign_blocked([{"temp": "37.5", "action": ""}], has_form_10=False)  # 37.5 is not above 37.5
    low = [{"temp": "36.2", "action": ""}]
    assert rules.visit_sign_blocked(low, has_form_10=False, baby=True) and not rules.visit_sign_blocked(low, has_form_10=False)


def test_form_08_orders_read_only():
    rules.form_08_nurse_patch({"given": True})
    with pytest.raises(rules.RuleError):
        rules.form_08_nurse_patch({"given": True, "dose": "2x"})
    with pytest.raises(rules.RuleError):
        rules.form_08_nurse_patch({"given": False})


@pytest.mark.parametrize("auto,consent,role,signer,client,expected", [
    (False, True, "client", None, "c@x.com", None),        # switch off
    (True, False, "client", None, "c@x.com", None),        # client did not agree
    (True, True, "client", None, "c@x.com", "c@x.com"),    # client signed
    (True, True, "representative", "r@x.com", "c@x.com", "r@x.com"),
    (True, True, "representative", None, "c@x.com", None),  # representative gave no email: never the client's
    (True, True, "witness", "w@x.com", "c@x.com", None),
    (True, True, "client", None, "", None),                 # no address
])
def test_copy_recipient_truth_table(auto, consent, role, signer, client, expected):
    assert rules.copy_recipient(auto_on=auto, client_consented=consent, signer_role=role, signer_email=signer, client_email=client) == expected


def test_copy_email_body_has_no_health_text():
    text = (rules.COPY_SUBJECT + rules.COPY_PLAIN + rules.COPY_HTML).lower()
    assert not any(w in text for w in ("consent", "wound", "pregnan", "baby", "mama", "medication", "diagnos"))


def test_form_08_values_lays_administrations_into_the_grid():
    from app.modules.care_forms import rules

    out = rules.form_08_values({"orders": {"medicine_name": "X"}, "administrations": [{"due": "08:00", "at": "08:05", "given": True, "initials": "AB"}, {"due": "14:00", "given": False, "reason": "refused", "code": "R"}]})
    assert out["medicine_name"] == "X" and out["t_r1c3"] == "Given" and out["t_r2c3"] == "R" and out["t_r2c5"] == "refused"


def test_registration_rejects_impossible_licence_expiry_date():
    from pydantic import ValidationError
    from app.modules.care_forms.router import RegistrationIn

    with pytest.raises(ValidationError):
        RegistrationIn(unmc_number='A1', unmc_licence_expiry='2026-99-99')
    assert RegistrationIn(unmc_number='A1', unmc_licence_expiry='2027-12-31').unmc_licence_expiry == '2027-12-31'
