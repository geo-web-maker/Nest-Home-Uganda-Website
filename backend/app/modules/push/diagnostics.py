"""Push notification diagnostics: configuration, live Google/Firebase checks, device and delivery inspection,
per-user "why no notification" explanations and real test sends.

Passive checks never contact Google. The live checks and sends are separate actions, and every route that runs them
sits behind the authenticator (TOTP) session. Device tokens are never returned in full.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import get_settings
from app.modules.push import fcm

PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skip"

# What each Firebase/Google error means for this app, in plain words.
ERROR_HELP = {
    "UNREGISTERED": "Google no longer knows this token (app reinstalled, data cleared or token rotated). Log in again on the phone to register a new one.",
    "INVALID_ARGUMENT": "Google rejected the message or the token is malformed. Check the token and the channel name.",
    "SENDER_ID_MISMATCH": "The token belongs to a different Firebase project than the one this server uses. The app's google-services.json and NEST_FCM_PROJECT_ID must match.",
    "THIRD_PARTY_AUTH_ERROR": "Only applies to iOS (APNs). Not expected for the Android app.",
    "QUOTA_EXCEEDED": "Firebase sending quota reached. Wait and retry.",
    "UNAVAILABLE": "Firebase is temporarily unavailable. Retry shortly.",
    "INTERNAL": "Firebase had an internal error. Retry shortly.",
    "PERMISSION_DENIED": "The service account is not allowed to send for this project. Give it the Firebase Cloud Messaging Admin role, and make sure the Firebase Cloud Messaging API is enabled in Google Cloud.",
    "UNAUTHENTICATED": "Google did not accept the credentials. Generate a new service account key for the same project.",
    "NOT_FOUND": "The project or token was not found. Check NEST_FCM_PROJECT_ID.",
    "GOOGLE_AUTH_REJECTED": "Google refused the service account key. It may be deleted, disabled or from another project.",
    "PUSH_SENDER_NOT_FCM": "NEST_PUSH_SENDER is not 'fcm', so this server never contacts Firebase.",
}


@dataclass(frozen=True)
class Check:
    id: str
    status: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def summarize(checks: list[Check]) -> dict[str, int]:
    return {s: sum(1 for c in checks if c.status == s) for s in (PASS, WARN, FAIL, SKIP)}


def mask_token(token: str | None) -> str | None:
    if not token:
        return None
    return f"{token[:8]}…{token[-4:]}" if len(token) > 16 else "…"


def explain_error(code: str | None) -> str:
    return ERROR_HELP.get(code or "", "") if code else ""


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def check_config() -> list[Check]:
    """Everything that can be judged from environment settings alone."""
    s = get_settings()
    out: list[Check] = []
    if s.push_sender == "fcm":
        out.append(Check("sender", PASS, "NEST_PUSH_SENDER is 'fcm': pushes are sent to Firebase."))
    else:
        out.append(Check("sender", FAIL, f"NEST_PUSH_SENDER is '{s.push_sender}'. In this mode nothing is ever sent to Firebase and no error appears. Set it to 'fcm' and redeploy."))

    raw = s.fcm_service_account_json
    source = "NEST_FCM_SERVICE_ACCOUNT_JSON"
    if not raw and s.fcm_service_account_json_b64:
        source = "NEST_FCM_SERVICE_ACCOUNT_JSON_B64"
    if not raw and not s.fcm_service_account_json_b64:
        out.append(Check("service_account", FAIL, "No service account key is set. Add NEST_FCM_SERVICE_ACCOUNT_JSON_B64."))
        account = None
    else:
        try:
            account = fcm._service_account()
            from cryptography.hazmat.primitives.serialization import load_pem_private_key
            load_pem_private_key(account["private_key"].encode(), password=None)
            out.append(Check("service_account", PASS, f"Key read from {source}: {account['client_email']}."))
        except Exception as exc:
            account = None
            out.append(Check("service_account", FAIL, f"The service account key in {source} cannot be used: {type(exc).__name__}: {str(exc)[:160]}. Paste the full key file again (for the _B64 variable, base64 of the whole file with no line breaks)."))

    if account:
        configured = s.fcm_project_id
        if not configured:
            out.append(Check("project", WARN, f"NEST_FCM_PROJECT_ID is empty; the key's project '{account['project_id']}' is used."))
        elif configured != account["project_id"]:
            out.append(Check("project", FAIL, f"NEST_FCM_PROJECT_ID is '{configured}' but the key belongs to '{account['project_id']}'. They must be the same project, and the same one the app was built with."))
        else:
            out.append(Check("project", PASS, f"Project is '{configured}' in both the setting and the key."))
    else:
        out.append(Check("project", SKIP, "Skipped because the service account key is not usable."))

    out.append(Check("channels", PASS, f"Messages use channels '{s.push_channel_normal}' (normal) and '{s.push_channel_critical}' (urgent). They must match the channels the Android app creates, or Android may drop or silence the notification."))
    out.append(Check("priority", PASS, "All pushes are sent at high priority, so idle phones do not delay them."))
    if s.push_ttl_normal_seconds < 60 or s.push_ttl_critical_seconds < 60:
        out.append(Check("ttl", WARN, "A time-to-live under 60 seconds can expire before a sleeping phone wakes."))
    else:
        out.append(Check("ttl", PASS, f"Messages stay deliverable for {s.push_ttl_normal_seconds // 3600}h (normal) / {s.push_ttl_critical_seconds // 3600}h (urgent)."))
    return out


APP_LABEL = {"admin": "Admin app", "nurse": "Nurse app"}
NURSE_HINT = ("The nurse app only registers for push after the nurse (1) turns on Visit reminders in the app, (2) allows notifications, "
              "and (3) is on a build that contains Firebase config (the NURSE_GOOGLE_SERVICES_JSON_BASE64 secret was set when the APK was built, "
              "for package ug.nesthomecare.nurse in the same Firebase project). If any of these is missing, no phone row is ever created.")
ADMIN_HINT = "The admin app registers after login once notifications are allowed. Log in on the phone."


async def check_devices() -> list[Check]:
    from app.modules.nurses.models import Device

    devices = await Device.find(Device.revoked_at == None).to_list()  # noqa: E711
    if not devices:
        return [Check("devices_admin", FAIL, "No phone has registered at all. " + ADMIN_HINT),
                Check("devices_nurse", FAIL, "No phone has registered at all. " + NURSE_HINT)]
    out: list[Check] = []
    for app in ("admin", "nurse"):
        mine = [d for d in devices if d.app == app]
        with_token = [d for d in mine if d.push_token]
        hint = NURSE_HINT if app == "nurse" else ADMIN_HINT
        if not mine:
            out.append(Check(f"devices_{app}", FAIL, f"No {APP_LABEL[app]} phone has registered. {hint}"))
        elif not with_token:
            out.append(Check(f"devices_{app}", FAIL, f"{len(mine)} {APP_LABEL[app]} phone(s) registered but none has a push token."))
        else:
            out.append(Check(f"devices_{app}", PASS, f"{len(with_token)} of {len(mine)} {APP_LABEL[app]} phone(s) have a push token."))
    unlabelled = [d for d in devices if not d.app]
    if unlabelled:
        out.append(Check("devices_unlabelled", WARN, f"{len(unlabelled)} phone(s) registered before phones were labelled by app. They are labelled the next time the app registers (log in again, or for the nurse app turn Visit reminders off and on)."))
    return out


async def check_deliveries(hours: int = 24) -> list[Check]:
    from app.modules.care_ops.models import PushDelivery

    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = await PushDelivery.find(PushDelivery.created_at >= since).to_list()
    if not rows:
        return [Check("deliveries", WARN, f"No push attempts in the last {hours} hours, so nothing has triggered a push yet. Use 'Full pipeline test' below.")]
    counts: dict[str, int] = {}
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1
    errors: dict[str, int] = {}
    for row in rows:
        if row.last_error:
            errors[row.last_error] = errors.get(row.last_error, 0) + 1
    text = ", ".join(f"{n} {k}" for k, n in sorted(counts.items()))
    if errors:
        top = max(errors, key=errors.get)  # type: ignore[arg-type]
        return [Check("deliveries", FAIL if counts.get("sent", 0) == 0 else WARN, f"Last {hours}h: {text}. Most common error: {top} ({errors[top]}). {explain_error(top)}")]
    return [Check("deliveries", PASS, f"Last {hours}h: {text}.")]


async def run_passive_checks() -> list[Check]:
    return [*check_config(), *await check_devices(), *await check_deliveries()]


async def check_google_auth() -> Check:
    """Live: exchange the service account key for a Google access token. Sends nothing."""
    import httpx

    try:
        account = fcm._service_account()
    except Exception as exc:
        return Check("google_auth", FAIL, f"No usable service account: {str(exc)[:160]}")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await fcm._access_token(client, account)
        return Check("google_auth", PASS, "Google accepted the service account key.")
    except httpx.HTTPStatusError as exc:
        return Check("google_auth", FAIL, f"Google refused the key (HTTP {exc.response.status_code}): {exc.response.text[:160]}. {explain_error('GOOGLE_AUTH_REJECTED')}")
    except Exception as exc:
        return Check("google_auth", FAIL, f"Could not reach Google: {type(exc).__name__}. Check the server's network access.")


async def list_devices(user_id: str | None = None, limit: int = 100, app: str = "any") -> list[dict[str, Any]]:
    from app.modules.auth.models import User
    from app.modules.nurses.models import Device

    query = Device.find(Device.user_id == user_id) if user_id else Device.find()
    devices = await query.sort("-created_at").limit(max(1, min(limit, 200))).to_list()
    if app in ("admin", "nurse"):
        devices = [d for d in devices if d.app == app]
    users = {}
    if devices:
        from beanie import PydanticObjectId
        ids = []
        for d in devices:
            try:
                ids.append(PydanticObjectId(d.user_id))
            except Exception:
                continue
        users = {str(u.id): u for u in await User.find({"_id": {"$in": ids}}).to_list()} if ids else {}
    now = datetime.now(UTC)
    rows = []
    for d in devices:
        u = users.get(d.user_id)
        stamp = d.push_token_updated_at or d.created_at
        if stamp is not None and stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=UTC)
        rows.append({
            "device_id": d.device_id,
            "user_id": d.user_id,
            "user_name": getattr(u, "name", None),
            "user_email": getattr(u, "email", None),
            "platform": d.platform,
            "app": d.app or "unlabelled",
            "has_token": bool(d.push_token),
            "token_preview": mask_token(d.push_token),
            "token_age_days": int((now - stamp).total_seconds() // 86400) if stamp else None,
            "registered_at": _iso(d.created_at),
            "token_updated_at": _iso(d.push_token_updated_at),
            "revoked_at": _iso(d.revoked_at),
        })
    return rows


async def recent_deliveries(status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    from app.modules.care_ops.models import PushDelivery

    query = PushDelivery.find(PushDelivery.status == status) if status else PushDelivery.find()
    rows = await query.sort("-created_at").limit(max(1, min(limit, 200))).to_list()
    return [{
        "id": r.id[:12], "user_id": r.user_id, "device_id": r.device_id, "category": r.category,
        "title": r.title, "status": r.status, "attempts": r.attempts, "critical": r.critical,
        "last_error": r.last_error, "help": explain_error(r.last_error) if r.last_error else "",
        "created_at": _iso(r.created_at), "sent_at": _iso(r.sent_at),
    } for r in rows]


async def find_user(query: str):
    """Find a user by id or e-mail address."""
    from app.modules.auth.models import User

    text = query.strip().lower()
    if not text:
        return None
    user = await User.find_one(User.email == text)
    if user:
        return user
    try:
        return await User.get(text)
    except Exception:
        return None


async def explain_user(query: str, *, mailbox_id: str | None = None, app: str = "any") -> dict[str, Any]:
    """Walk every gate a mail push passes for one person and say which one stops it."""
    from app.core import sandbox

    steps: list[Check] = []
    user = await find_user(query)
    if user is None:
        return {"found": False, "steps": [Check("user", FAIL, "No user with that e-mail or id.").as_dict()]}
    user_id = str(user.id)
    steps.append(Check("user", PASS, f"{user.name} <{user.email}>."))

    if await sandbox.master_enabled() and await sandbox.is_test_user(user_id):
        steps.append(Check("test_account", WARN, "This is a test account. Real mail pushes only reach test accounts while the test sandbox is active, and are skipped otherwise."))
    else:
        steps.append(Check("test_account", PASS, "Not a test account."))

    if app == "nurse":
        from app.modules.nurses.models import NurseProfile
        has_scope = user.is_superadmin or "field:use" in user.scopes
        steps.append(Check("field_access", PASS if has_scope else FAIL, "Has the field:use permission the nurse app needs." if has_scope else "Missing the field:use permission. The nurse app's /field/me and /field/timesheets answer 403 for this account."))
        profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
        if profile is None:
            steps.append(Check("nurse_profile", FAIL, "No nurse profile. The nurse app calls /field/me and /field/timesheets and the server answers 404 'Nurse profile not found' for exactly this reason. Create the profile under Care > Nurses, or sign in with a nurse account."))
        elif not profile.active:
            steps.append(Check("nurse_profile", FAIL, "The nurse profile is inactive, which also makes /field/me and /field/timesheets answer 404. Reactivate it under Care > Nurses."))
        else:
            steps.append(Check("nurse_profile", PASS, f"Active nurse profile (staff number {profile.staff_number})."))

    try:
        from app.modules.mail import db as mail_db
        rows = await mail_db.get_pool().fetch("SELECT mailbox_id FROM mailbox_member WHERE user_id=$1", user_id)
        none_status = WARN if app == "nurse" else FAIL
        if not rows:
            steps.append(Check("mailbox", none_status, "Not a member of any mailbox, so no MAIL push is sent to them." + (" Visit and timesheet pushes are unaffected." if app == "nurse" else "")))
        elif mailbox_id and mailbox_id not in {str(r["mailbox_id"]) for r in rows}:
            steps.append(Check("mailbox", none_status, "This person is not a member of that mailbox."))
        else:
            steps.append(Check("mailbox", PASS, f"Member of {len(rows)} mailbox(es)."))
    except Exception as exc:
        steps.append(Check("mailbox", SKIP, f"Mail database not available here: {type(exc).__name__}."))

    all_devices = await list_devices(user_id)
    devices = all_devices if app == "any" else [d for d in all_devices if d["app"] == app]
    active = [d for d in devices if not d["revoked_at"]]
    label = APP_LABEL.get(app, "app")
    if not devices:
        other = [d for d in all_devices if d["app"] != app] if app != "any" else []
        hint = NURSE_HINT if app == "nurse" else ADMIN_HINT
        extra = f" (They do have {len(other)} phone(s) registered under another label, which this test does not count.)" if other else ""
        steps.append(Check("devices", FAIL, f"No {label} phone is registered for this person. {hint}{extra}"))
    elif not active:
        steps.append(Check("devices", FAIL, "All devices are revoked. Log in again on the phone."))
    elif not any(d["has_token"] for d in active):
        steps.append(Check("devices", FAIL, "A device is registered but has no push token. Firebase never gave the app a token."))
    else:
        with_token = [d for d in active if d["has_token"]]
        old = [d for d in with_token if (d["token_age_days"] or 0) > 60]
        steps.append(Check("devices", WARN if old else PASS, f"{len(with_token)} active {label} device(s) with a token." + (" Some tokens are over 60 days old; refresh by logging in again." if old else "")))

    from app.modules.care_ops.models import PushDelivery
    last = await PushDelivery.find(PushDelivery.user_id == user_id).sort("-created_at").limit(5).to_list()
    if not last:
        steps.append(Check("history", WARN, "No push has ever been attempted for this person."))
    else:
        bad = [r for r in last if r.last_error]
        text = ", ".join(f"{r.status}" for r in last)
        if bad:
            steps.append(Check("history", FAIL, f"Latest attempts: {text}. Last error: {bad[0].last_error}. {explain_error(bad[0].last_error)}"))
        else:
            steps.append(Check("history", PASS, f"Latest attempts: {text}. Google accepted them, so if nothing shows, the phone is hiding the notification (battery, channel or app notification settings)."))
    if app != "nurse":
        steps.append(Check("sender_excluded", WARN, "The person who SENT a mail is never notified about it. Test from a different account."))
    return {"found": True, "user_id": user_id, "steps": [s.as_dict() for s in steps], "devices": devices}


async def send_test(
    device_id: str, *, title: str, body: str, critical: bool = False, validate_only: bool = False
) -> dict[str, Any]:
    """Send straight to one device and return Google's exact answer. Works even while the sender is 'fake'."""
    from app.modules.nurses.models import Device

    device = await Device.find_one(Device.device_id == device_id)
    if device is None:
        return {"ok": False, "stage": "device", "error": "DEVICE_NOT_FOUND", "detail": "No such device.", "help": ""}
    if device.revoked_at is not None:
        return {"ok": False, "stage": "device", "error": "DEVICE_REVOKED", "detail": "This device is revoked.", "help": ""}
    if not device.push_token:
        return {"ok": False, "stage": "device", "error": "NO_TOKEN", "detail": "This device has no push token.", "help": "Log in again on the phone."}
    result = await fcm.send_push_detailed(
        device.push_token, title[:120], body[:300], {"kind": "diagnostic"},
        critical=critical, validate_only=validate_only, force_sender=True,
    )
    result["help"] = explain_error(result.get("error"))
    result["device_id"] = device_id
    result["token_preview"] = mask_token(device.push_token)
    result["sender_setting"] = get_settings().push_sender
    if result.get("ok") and not validate_only and get_settings().push_sender != "fcm":
        result["note"] = "Delivered by this test, but NEST_PUSH_SENDER is not 'fcm', so real notifications are still NOT sent."
    if result.get("error") == "UNREGISTERED":
        device.push_token = None
        device.push_token_updated_at = datetime.now(UTC)
        await device.save()
        result["note"] = "The dead token was removed. Log in again on the phone to register a new one."
    return result


async def run_pipeline_test(user_id: str) -> dict[str, Any]:
    """Send a clearly labelled notification to the caller's own devices through the real dispatcher."""
    from app.modules.push.dispatcher import dispatch

    results = await dispatch(
        [user_id], "diagnostic", "Push diagnostic", "Test through the real delivery pipeline.",
        {"kind": "diagnostic"},
    )
    mode = get_settings().push_sender
    note = None
    if mode != "fcm":
        note = "NEST_PUSH_SENDER is not 'fcm': the pipeline ran but nothing reached Firebase."
    elif not results:
        note = "No delivery was created: you have no registered device with a push token, or you are a test account outside the sandbox."
    return {"mode": mode, "results": results, "note": note}


# The real notifications nurses receive, with the same category, text, channel and deep link the live code uses.
SCENARIOS: dict[str, tuple[str, str, str, dict[str, str], bool]] = {
    "visit_assigned": ("visit", "New visit scheduled", "A visit was added to your schedule.", {"kind": "visit_assigned", "deep_link": "/"}, False),
    "visit_cancelled": ("visit", "Visit cancelled", "A visit on your schedule was cancelled.", {"kind": "visit_cancelled", "deep_link": "/"}, False),
    "timesheet_approved": ("timesheet", "Timesheet approved", "Your timesheet was approved.", {"kind": "timesheet_approved", "deep_link": "/timesheets"}, False),
    "timesheet_sent_back": ("timesheet", "Timesheet needs changes", "Your supervisor sent a timesheet back. Open it to see why.", {"kind": "timesheet_sent_back", "deep_link": "/timesheets"}, False),
    "mail": ("mail", "New mail", "You have a new message.", {"kind": "mail", "deep_link": "/mail"}, False),
    "safety_alert": ("sos", "Staff safety alert", "A staff safety alert needs a response.", {"kind": "diagnostic"}, True),
}


async def send_scenario(query: str, scenario: str) -> dict[str, Any]:
    """Send one real-looking notification to a person through the real dispatcher. Titles are prefixed 'Test:'."""
    from app.modules.care_ops.models import PushDelivery
    from app.modules.push.dispatcher import dispatch

    if scenario not in SCENARIOS:
        return {"ok": False, "note": "Unknown scenario.", "results": []}
    user = await find_user(query)
    if user is None:
        return {"ok": False, "note": "No user with that e-mail or id.", "results": []}
    category, title, body, data, critical = SCENARIOS[scenario]
    from app.modules.push.dispatcher import resolve_critical
    critical = await resolve_critical(category, critical)
    user_id = str(user.id)
    results = await dispatch([user_id], category, "Test: " + title, body, data, critical=critical)
    rows = await PushDelivery.find(PushDelivery.user_id == user_id).sort("-created_at").limit(max(1, len(results))).to_list()
    for item, row in zip(results, rows):
        item["error"] = row.last_error
        item["help"] = explain_error(row.last_error) if row.last_error else ""
    mode = get_settings().push_sender
    note = None
    if mode != "fcm":
        note = "NEST_PUSH_SENDER is not 'fcm': nothing reached Firebase."
    elif not results:
        note = "No delivery was created: this person has no registered phone with a push token, or is a test account outside the sandbox."
    return {"ok": bool(results) and all(r["status"] == "sent" for r in results), "mode": mode, "scenario": scenario,
            "critical": critical, "results": results, "note": note,
            "to": f"{user.name} <{user.email}>"}


async def nurse_access_problems() -> dict[str, Any]:
    """Accounts that can open the nurse app but would get 404/403 from /field/me and /field/timesheets."""
    from app.modules.auth.models import User
    from app.modules.nurses.models import NurseProfile

    users = await User.find(User.is_active == True).to_list()  # noqa: E712
    profiles = {p.user_id: p for p in await NurseProfile.find().to_list()}
    problems = []
    nurses_ok = 0
    for user in users:
        wants_field = user.is_superadmin or "field:use" in user.scopes
        profile = profiles.get(str(user.id))
        if profile is not None and profile.active and "field:use" in user.scopes:
            nurses_ok += 1
        elif profile is not None and profile.active and not wants_field:
            problems.append({"user": user.name, "email": user.email, "problem": "Has an active nurse profile but is missing the field:use permission (403 in the nurse app)."})
        elif profile is not None and not profile.active and "field:use" in user.scopes:
            problems.append({"user": user.name, "email": user.email, "problem": "Nurse profile is inactive (404 in the nurse app)."})
        elif profile is None and "field:use" in user.scopes:
            problems.append({"user": user.name, "email": user.email, "problem": "Has the nurse permission but no nurse profile (404 in the nurse app)."})
    return {"ok_count": nurses_ok, "problems": problems,
            "note": "Accounts without field:use and without a nurse profile (for example office staff) are not listed: they are not meant to use the nurse app."}
