"""Online-enhanced care alert delivery. Core records are saved before any provider call."""

from app.core.config import get_settings
from app.core.phone import is_mobile, normalise_e164
from app.modules.auth.models import User
from app.modules.care_ops.models import CareAlert, SOSCase
from app.modules.care_ops.sms_templates import render_sms
from app.modules.notifications.config import load_config
from app.modules.notifications.providers import get_sms_provider
from app.modules.notifications.service import send_sms
from app.modules.nurses.models import NurseProfile
from app.modules.push.dispatcher import dispatch
from app.modules.settings.care_service import care_values


async def _send_numbers(numbers: list[str], message: str, template: str) -> int:
    config = await load_config()
    provider = get_sms_provider()
    sent = 0
    if not config.staff_enabled:
        return 0
    for raw in dict.fromkeys(numbers):
        number = normalise_e164(raw)
        if not number or not is_mobile(number):
            continue
        if await send_sms(
            provider,
            config,
            to=number,
            text=message,
            audience="staff",
            template=template,
            enquiry=None,
        ):
            sent += 1
    return sent


async def notify_sos(case: SOSCase) -> dict:
    values = await care_values()
    settings = get_settings()
    url = settings.frontend_url.rstrip("/") + f"/admin/care/sos/{case.id}"
    if case.test:
        test_number = normalise_e164(str(values.get("sms.test_number", "")))
        message = "[TEST] " + render_sms("sos", url)
        sms = await _send_numbers([test_number] if test_number else [], message, "care_sos_test")
        return {"sms_sent": sms, "test": True}
    recipients = []
    contacts = values.get("sos.on_call_contacts", {})
    if isinstance(contacts, dict):
        recipients.extend(str(value) for value in contacts.values())
    profile = await NurseProfile.find_one(NurseProfile.user_id == case.nurse_id)
    if profile and profile.supervisor_id:
        supervisor = await User.get(profile.supervisor_id)
        if supervisor and supervisor.phone_e164:
            recipients.append(supervisor.phone_e164)
    sms = await _send_numbers(recipients, render_sms("sos", url), "care_sos")
    user_ids = [profile.supervisor_id] if profile and profile.supervisor_id else []
    if user_ids:
        await dispatch(
            user_ids,
            "sos",
            "Staff safety alert",
            "A staff safety alert needs a response.",
            {"case_id": case.id},
            critical=True,
        )
    return {"sms_sent": sms, "test": False}


async def notify_alert(alert: CareAlert) -> None:
    profile = (
        await NurseProfile.find_one(NurseProfile.user_id == alert.nurse_id)
        if alert.nurse_id
        else None
    )
    recipients = [profile.supervisor_id] if profile and profile.supervisor_id else []
    await dispatch(
        recipients,
        "care_alert",
        "Care alert",
        "A care operations alert needs review.",
        {"alert_id": alert.id},
        critical=alert.severity == "critical",
    )
    if alert.severity == "critical":
        values = await care_values()
        numbers = []
        contacts = values.get("sos.on_call_contacts", {})
        if isinstance(contacts, dict):
            numbers.extend(str(value) for value in contacts.values())
        await _send_numbers(
            numbers,
            render_sms(
                "critical_alert", get_settings().frontend_url.rstrip("/") + "/admin/care/alerts"
            ),
            "care_critical_alert",
        )


async def send_test_sos_sms() -> bool:
    """Send only the configured SOS test message; never create an SOS case or alert."""
    values = await care_values()
    test_number = normalise_e164(str(values.get("sms.test_number", "")))
    if not test_number or not is_mobile(test_number):
        return False
    settings = get_settings()
    url = settings.frontend_url.rstrip("/") + "/admin/care/sos"
    return (
        await _send_numbers([test_number], "[TEST] " + render_sms("sos", url), "care_sos_test") == 1
    )
