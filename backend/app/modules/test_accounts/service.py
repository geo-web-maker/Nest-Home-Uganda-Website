"""Two sandbox test accounts (a nurse and an admin) behind a master switch only a TOTP-verified superadmin can use.

Rules enforced elsewhere: their mailboxes (`mailbox.is_test`) exchange mail only with each other,
external sends go to the console sink and nothing from outside is delivered to them.
Switching an account off, or "reset data", deletes what the two accounts created.
"""

import logging
import os
import re
import secrets
from datetime import UTC, datetime

from app.core.errors import NotFound, ValidationFailed
from app.core.security import hash_password
from app.modules.audit import service as audit
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.scopes import ALL_SCOPE_IDS, SCOPE_PRESETS, SCOPES
from app.modules.nurses.models import NurseProfile
from app.modules.test_accounts.models import TestSandboxConfig

log = logging.getLogger(__name__)
REACHES = ("own", "team", "all")
# Test accounts can never hold the scopes that change system or care configuration.
FORBIDDEN_SCOPES = frozenset({"system:manage", "carecfg:write"})
# Named variations of who the two accounts are to each other. Switch between them at any time.
SCENARIOS: dict[str, dict] = {
    "separate": {"label": "Separate: nurse and admin, not linked", "nurse": "nurse", "admin": "admin", "reach": "own", "link": False},
    "supervised": {"label": "Supervisor supervises the nurse (team)", "nurse": "nurse", "admin": "supervisor", "reach": "team", "link": True},
    "admin_team": {"label": "Admin supervises the nurse (team)", "nurse": "nurse", "admin": "admin", "reach": "team", "link": True},
    "admin_all": {"label": "Admin supervises the nurse and sees everything", "nurse": "nurse", "admin": "admin", "reach": "all", "link": True},
    "executive_view": {"label": "Executive view of the nurse (everything)", "nurse": "nurse", "admin": "executive", "reach": "all", "link": True},
    "lawyer_view": {"label": "Lawyer, not linked (everything)", "nurse": "nurse", "admin": "lawyer", "reach": "all", "link": False},
}


DELIVERIES = ("sink", "allowlist")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")


async def get_config() -> TestSandboxConfig:
    cfg = await TestSandboxConfig.find_one(TestSandboxConfig.key == "main")
    if cfg is None:
        cfg = await TestSandboxConfig(key="main").insert()
    return cfg


def _config_out(cfg: TestSandboxConfig) -> dict:
    return {"enabled": cfg.enabled, "delivery": cfg.delivery, "emails": list(cfg.emails), "phones": list(cfg.phones)}


async def update_config(actor, *, delivery: str | None, emails: list[str] | None, phones: list[str] | None) -> dict:
    """Choose where a test account's real email and SMS may go. Default: nowhere (console sink)."""
    from app.core import sandbox

    cfg = await get_config()
    if delivery is not None and delivery not in DELIVERIES:
        raise ValidationFailed("Unknown delivery mode.", {"delivery": "invalid"})
    clean_emails = None
    if emails is not None:
        clean_emails = sorted({e.strip().lower() for e in emails if e.strip()})
        if any(not _EMAIL_RE.match(e) for e in clean_emails) or len(clean_emails) > 5:
            raise ValidationFailed("Enter up to 5 valid email addresses.", {"emails": "invalid"})
        test_addresses = {spec["email"] for spec in _definitions().values()}
        if set(clean_emails) & test_addresses:
            raise ValidationFailed("A test account's own address cannot be used.", {"emails": "invalid"})
    clean_phones = None
    if phones is not None:
        clean_phones = sorted({p.strip().replace(" ", "") for p in phones if p.strip()})
        if any(not _PHONE_RE.match(p) for p in clean_phones) or len(clean_phones) > 5:
            raise ValidationFailed("Enter up to 5 numbers in international format, such as +256700000000.", {"phones": "invalid"})
    before = _config_out(cfg)
    if delivery is not None:
        cfg.delivery = delivery
    if clean_emails is not None:
        cfg.emails = clean_emails
    if clean_phones is not None:
        cfg.phones = clean_phones
    await cfg.save()
    sandbox.forget()
    await audit.record(actor, "test_account.config", "user", None, "test accounts", before=before, after=_config_out(cfg))
    return _config_out(cfg)


async def set_master(actor, enabled: bool) -> dict:
    """The master switch. Off: both accounts are switched off, cannot sign in, and everything they made is deleted."""
    from app.core import sandbox

    cfg = await get_config()
    cfg.enabled = enabled
    await cfg.save()
    sandbox.forget()
    deleted: dict = {}
    if not enabled:
        for key in _definitions():
            user = await _user(key)
            if user is not None and user.is_active:
                result = await deactivate(actor, key)
                deleted = result.get("deleted") or deleted
        if not deleted:
            deleted = await purge_data(actor)
    else:
        await ensure_test_accounts()
    await audit.record(actor, "test_account.master", "user", None, "test accounts", after={"enabled": enabled})
    return {"enabled": enabled, "deleted": deleted}


def _domain() -> str:
    return os.environ.get("TEST_ACCOUNT_DOMAIN", "example.com").strip().lstrip("@") or "example.com"


def _definitions() -> dict[str, dict]:
    d = _domain()
    return {
        "nurse": {"name": "Test Nurse", "email": f"test.nurse@{d}", "kind": "nurse", "reach": "own",
                  "scopes": sorted(SCOPE_PRESETS["nurse"]), "staff_number": "TEST-NURSE"},
        "admin": {"name": "Test Admin", "email": f"test.admin@{d}", "kind": "admin", "reach": "own",
                  "scopes": sorted(SCOPE_PRESETS["admin"]), "staff_number": None},
    }


async def _user(key: str) -> User | None:
    return await User.find_one(User.email == _definitions()[key]["email"])


async def ensure_test_accounts() -> int:
    """Create any missing test account as inactive. Safe to run repeatedly. Returns how many were created."""
    created = 0
    for spec in _definitions().values():
        existing = await User.find_one(User.email == spec["email"])
        if existing is not None:
            if not existing.is_test:
                existing.is_test = True
                await existing.save()
            continue
        user = await User(
            name=spec["name"], email=spec["email"], password_hash=hash_password(secrets.token_urlsafe(32)),
            scopes=spec["scopes"], kind=spec["kind"], reach=spec["reach"], is_active=False, is_test=True,
            invite_accepted_at=datetime.now(UTC),
        ).insert()
        if spec["staff_number"]:
            await NurseProfile(user_id=str(user.id), staff_number=spec["staff_number"], active=False).insert()
        created += 1
    if created:
        from app.core import sandbox
        sandbox.forget()
    return created


async def _mail_enabled() -> bool:
    try:
        from app.modules.mail.settings_service import get_value
        return bool(await get_value("mail.enabled"))
    except Exception:
        return False


async def _mark_mailbox(user: User) -> None:
    """Give the account its mailbox and put it inside the sandbox. Raises if mail is on and this fails."""
    from app.modules.mail import db as mail_db
    from app.modules.mail.core_service import ensure_default_mailbox_if_configured

    await ensure_default_mailbox_if_configured(user)
    async with mail_db.get_pool().acquire() as conn:
        await conn.execute("UPDATE mailbox SET is_test=true WHERE owner_user_id=$1", str(user.id))


async def _get(key: str) -> User:
    if key not in _definitions():
        raise NotFound("Unknown test account.")
    await ensure_test_accounts()
    user = await _user(key)
    if user is None:
        raise NotFound("Test account not found.")
    return user


def _preset_name(scopes: list[str]) -> str:
    have = frozenset(scopes) | {"mail:use"}
    for name, preset in SCOPE_PRESETS.items():
        if have == frozenset(preset) | {"mail:use"}:
            return name
    return "custom"


async def _linked() -> bool:
    admin, nurse = await _user("admin"), await _user("nurse")
    if not admin or not nurse:
        return False
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(nurse.id))
    return bool(profile and profile.supervisor_id == str(admin.id))


async def list_test_accounts() -> dict:
    await ensure_test_accounts()
    items = []
    for key, spec in _definitions().items():
        user = await _user(key)
        scopes = sorted(user.scopes) if user else []
        items.append({"key": key, "name": spec["name"], "email": spec["email"], "kind": spec["kind"],
                      "active": bool(user and user.is_active), "scopes": scopes,
                      "preset": _preset_name(scopes), "reach": user.reach if user else "own"})
    return {
        "config": _config_out(await get_config()),
        "items": items, "linked": await _linked(), "reaches": list(REACHES),
        "presets": {n: sorted(p) for n, p in SCOPE_PRESETS.items() if n != "super_admin"},
        "scenarios": {k: v["label"] for k, v in SCENARIOS.items()},
        "catalogue": [{"id": s.id, "group": s.group, "label": s.label} for s in SCOPES if s.id not in FORBIDDEN_SCOPES],
    }


async def _revoke_sessions(user: User) -> None:
    await RefreshToken.find(RefreshToken.user_id == user.id, RefreshToken.revoked_at == None).update(  # noqa: E711
        {"$set": {"revoked_at": datetime.now(UTC)}}
    )


async def set_access(actor, key: str, *, preset: str | None, scopes: list[str] | None, reach: str | None) -> dict:
    """Change one account's scopes (a preset or an explicit list) and/or reach. Takes effect at its next sign-in."""
    user = await _get(key)
    if preset is not None:
        if preset not in SCOPE_PRESETS or preset == "super_admin":
            raise ValidationFailed("Unknown preset.", {"preset": "invalid"})
        chosen = set(SCOPE_PRESETS[preset])
    elif scopes is not None:
        chosen = set(scopes)
    else:
        chosen = set(user.scopes)
    unknown = chosen - ALL_SCOPE_IDS
    if unknown or chosen & FORBIDDEN_SCOPES:
        raise ValidationFailed("Those scopes are not allowed on a test account.", {"scopes": "invalid"})
    if reach is not None and reach not in REACHES:
        raise ValidationFailed("Unknown reach.", {"reach": "invalid"})
    before = {"scopes": sorted(user.scopes), "reach": user.reach}
    user.scopes = sorted(chosen | {"mail:use"})
    if reach is not None:
        user.reach = reach
    await user.save()
    await _revoke_sessions(user)  # scopes ride in the access token; sign in again to pick them up
    await audit.record(actor, "test_account.access", "user", str(user.id), user.email,
                       before=before, after={"scopes": user.scopes, "reach": user.reach})
    return {"key": key, "scopes": user.scopes, "reach": user.reach}


async def set_link(actor, supervises: bool) -> dict:
    """Make the test admin the test nurse's supervisor, or remove that link."""
    admin, nurse = await _get("admin"), await _get("nurse")
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(nurse.id))
    if profile is None:
        raise NotFound("Test nurse profile not found.")
    profile.supervisor_id = str(admin.id) if supervises else None
    await profile.save()
    await audit.record(actor, "test_account.link", "user", str(admin.id), admin.email, after={"supervises": supervises})
    return {"linked": supervises}


async def apply_scenario(actor, name: str) -> dict:
    spec = SCENARIOS.get(name)
    if spec is None:
        raise ValidationFailed("Unknown scenario.", {"scenario": "invalid"})
    await set_access(actor, "nurse", preset=spec["nurse"], scopes=None, reach="own")
    await set_access(actor, "admin", preset=spec["admin"], scopes=None, reach=spec["reach"])
    await set_link(actor, spec["link"])
    return {"scenario": name}


async def activate(actor, key: str) -> dict:
    cfg = await get_config()
    if not cfg.enabled:
        raise ValidationFailed("Turn the test accounts master switch on first.", {"enabled": "off"})
    user = await _get(key)
    other = await _user("admin" if key == "nurse" else "nurse")
    if not (other and other.is_active):
        await purge_data(actor)  # the first account to open starts from nothing: nothing is kept between runs
    try:
        await _mark_mailbox(user)  # sandbox first: if mail is on and this fails, the account stays off
    except Exception as exc:
        if await _mail_enabled():
            log.exception("test account mail sandbox could not be set up")
            raise ValidationFailed("The mail sandbox could not be set up, so this account stays off. Check the mail database and migrations.") from exc
    password = "Tst-" + secrets.token_urlsafe(9) + "-9a"
    user.password_hash = hash_password(password)
    user.is_active = True
    user.is_test = True
    user.failed_logins = 0
    user.locked_until = None
    user.temp_password_expires_at = None
    await user.save()
    from app.core import sandbox
    sandbox.forget()
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    if profile is not None:
        profile.active = True
        await profile.save()
    await audit.record(actor, "test_account.activate", "user", str(user.id), user.email)
    return {"key": key, "email": user.email, "password": password, "active": True}


async def _purge_mail(user_ids: list[str]) -> dict:
    try:
        from app.modules.mail import db as mail_db
        pool = mail_db.get_pool()
    except Exception:
        return {"mail": "skipped"}
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                boxes = [r["id"] for r in await conn.fetch(
                    "SELECT id FROM mailbox WHERE owner_user_id=ANY($1::text[]) AND is_test", user_ids)]
                if not boxes:
                    return {"mail": 0}
                msgs = [r["message_id"] for r in await conn.fetch(
                    "SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=ANY($1::uuid[])", boxes)]
                await conn.execute("DELETE FROM mailbox_message WHERE mailbox_id=ANY($1::uuid[])", boxes)
                await conn.execute("DELETE FROM outbox WHERE message_id=ANY($1::uuid[])", msgs)
                gone = await conn.execute(
                    "DELETE FROM message m WHERE m.id=ANY($1::uuid[]) AND NOT EXISTS "
                    "(SELECT 1 FROM mailbox_message mm WHERE mm.message_id=m.id)", msgs)
                return {"mail": int(str(gone).split()[-1]) if gone else 0}
    except Exception:
        log.exception("test account mail purge failed")
        return {"mail": "failed"}


async def _delete_photo_files(nurse_ids: list[str]) -> int | str:
    """Remove the stored image files behind the test nurse's photo records (best effort)."""
    from app.core.config import get_settings
    from app.core.photo_store import delete_asset
    from app.modules.visits.models import VisitPhoto

    removed = 0
    for photo in await VisitPhoto.find({"nurse_id": {"$in": nurse_ids}}).to_list():
        try:
            if await delete_asset(get_settings(), photo.cloudinary_public_id, delivery_type=photo.delivery_type):
                removed += 1
        except Exception:
            log.warning("test photo file could not be removed (%s)", photo.id)
    return removed


async def purge_data(actor, *, keep_login: bool = True) -> dict:
    """Delete what the two test accounts created: field data, alerts, notifications, devices, audit and mail."""
    from app.modules.audit.models import AuditLog
    from app.modules.care_ops.models import (
        CareAlert, CareConsent, CareInboxNotification, CareTimesheet, PushDelivery, SOSCase,
    )
    from app.modules.field_ops.models import SyncPushReceipt
    from app.modules.flags.models import VisitFlag
    from app.modules.nurses.models import Device
    from app.modules.visits.models import (
        Visit, VisitAnnotation, VisitEvent, VisitNote, VisitPhoto, VisitSyncTombstone,
    )

    users = [u for u in [await _user("nurse"), await _user("admin")] if u is not None]
    ids = [str(u.id) for u in users]
    oids = [u.id for u in users]
    if not ids:
        return {}
    done: dict = {}
    try:
        done["photo_files"] = await _delete_photo_files(ids)
        from app.modules.care_clients.models import CareClient
        from app.modules.places.models import CarePlace, PlaceStay

        clients = await CareClient.find({"created_by": {"$in": ids}}).to_list()
        client_ids = [c.id for c in clients]
        places = await CarePlace.find({"$or": [{"created_by": {"$in": ids}}, {"client_id": {"$in": client_ids}}]}).to_list()
        place_ids = [p.id for p in places]
        await PlaceStay.find({"$or": [{"place_id": {"$in": place_ids}}, {"client_id": {"$in": client_ids}}]}).delete()
        await CarePlace.find({"id": {"$in": place_ids}}).delete()
        await CareClient.find({"id": {"$in": client_ids}}).delete()
        done["clients"], done["places"] = len(client_ids), len(place_ids)
    except Exception:
        log.exception("test data purge failed for clients/places")
        done["clients"] = "failed"
    by_nurse = [Visit, VisitSyncTombstone, VisitEvent, VisitNote, VisitPhoto, CareAlert, CareTimesheet, SOSCase, VisitFlag]
    by_user = [VisitAnnotation, CareInboxNotification, CareConsent, PushDelivery, SyncPushReceipt, Device]
    for model in by_nurse + by_user:
        field = "nurse_id" if model in by_nurse else "user_id"
        try:
            res = await model.find({field: {"$in": ids}}).delete()
            done[model.__name__] = getattr(res, "deleted_count", 0)
        except Exception:
            log.exception("test data purge failed for %s", model.__name__)
            done[model.__name__] = "failed"
    try:
        await Visit.find({"created_by": {"$in": ids}}).delete()
        res = await AuditLog.find({"user_id": {"$in": oids}, "action": {"$not": {"$regex": "^test_account\\."}}}).delete()
        done["AuditLog"] = getattr(res, "deleted_count", 0)
    except Exception:
        log.exception("test data purge failed for audit/visits")
    done.update(await _purge_mail(ids))
    await audit.record(actor, "test_account.purge", "user", None, "test accounts", after={"counts": done})
    return done


async def reset_data(actor) -> dict:
    await _get("nurse")
    return {"deleted": await purge_data(actor)}


async def deactivate(actor, key: str) -> dict:
    user = await _get(key)
    user.is_active = False
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    await user.save()
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    if profile is not None:
        profile.active = False
        await profile.save()
    await _revoke_sessions(user)
    await audit.record(actor, "test_account.deactivate", "user", str(user.id), user.email)
    other = await _user("admin" if key == "nurse" else "nurse")
    deleted = await purge_data(actor) if not (other and other.is_active) else {}
    return {"key": key, "email": user.email, "active": False, "deleted": deleted}
