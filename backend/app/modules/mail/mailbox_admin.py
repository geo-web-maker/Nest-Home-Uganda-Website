# ruff: noqa: E501
"""Admin tools for the mail address space: see every taken address, whether it holds real mail,
and rename, reassign, move or delete it. Also used to free addresses when a user is deleted.

"Real" content means anything other than the system welcome message: sent mail, drafts, or any
non-internal message. A mailbox with no real content is safe to remove outright.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from app.core.errors import Conflict, Forbidden, NotFound
from app.modules.mail import db
from app.modules.mail.core_service import _RESERVED, _audit, _local_part

log = logging.getLogger(__name__)

_PROTECTED = set(_RESERVED) | {"no-reply", "noreply"}

_COUNTS_SQL = """
SELECT mm.mailbox_id,
       count(*) AS total,
       count(*) FILTER (WHERE mm.folder IN ('sent','drafts') OR m.origin <> 'internal') AS real,
       count(*) FILTER (WHERE mm.folder='inbox') AS inbox,
       count(*) FILTER (WHERE mm.folder='sent') AS sent,
       count(*) FILTER (WHERE mm.folder='drafts') AS drafts,
       max(mm.received_at) AS last_at
  FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
 GROUP BY mm.mailbox_id
"""


async def _users_by_id(ids: list[str]) -> dict[str, Any]:
    """Users that still exist, keyed by id string. Malformed ids simply do not match."""
    from beanie import PydanticObjectId
    from app.modules.auth.models import User

    oids = []
    for raw in ids:
        try:
            oids.append(PydanticObjectId(raw))
        except Exception:
            continue
    if not oids:
        return {}
    users = await User.find({"_id": {"$in": oids}}).to_list()
    return {str(u.id): u for u in users}


async def existing_user_ids(ids: list[str]) -> set[str]:
    return set((await _users_by_id(list(ids))).keys())


async def list_mailboxes() -> dict[str, Any]:
    from app.modules.auth.models import User

    pool = db.get_pool()
    rows = await pool.fetch(
        f"""SELECT b.id, b.local_part::text AS local_part, b.kind, b.owner_user_id, b.display_name, b.state,
                   b.sending_suspended, b.legal_hold, b.created_at, b.closed_at,
                   coalesce(c.total,0) AS total, coalesce(c.real,0) AS real, coalesce(c.inbox,0) AS inbox,
                   coalesce(c.sent,0) AS sent, coalesce(c.drafts,0) AS drafts, c.last_at,
                   coalesce(al.aliases, ARRAY[]::text[]) AS aliases, coalesce(mem.members,0) AS members
              FROM mailbox b
              LEFT JOIN ({_COUNTS_SQL}) c ON c.mailbox_id=b.id
              LEFT JOIN (SELECT mailbox_id, array_agg(local_part::text ORDER BY local_part) AS aliases
                           FROM mailbox_alias GROUP BY mailbox_id) al ON al.mailbox_id=b.id
              LEFT JOIN (SELECT mailbox_id, count(*) AS members FROM mailbox_member GROUP BY mailbox_id) mem ON mem.mailbox_id=b.id
             ORDER BY b.kind, b.local_part"""
    )
    owners = await _users_by_id([r["owner_user_id"] for r in rows if r["owner_user_id"]])
    domain = str(await _domain())
    items = []
    owned = set()
    for r in rows:
        owner = owners.get(r["owner_user_id"]) if r["owner_user_id"] else None
        orphan = r["kind"] == "personal" and owner is None
        if r["owner_user_id"]:
            owned.add(r["owner_user_id"])
        reason = _delete_block_reason(r["local_part"], r["legal_hold"], r["kind"], owner is not None)
        items.append({
            "id": str(r["id"]), "address": f"{r['local_part']}@{domain}", "local_part": r["local_part"],
            "kind": r["kind"], "state": r["state"], "display_name": r["display_name"],
            "owner": {"id": r["owner_user_id"], "name": owner.name, "email": owner.email, "is_active": owner.is_active} if owner else None,
            "orphan": orphan, "aliases": list(r["aliases"]), "members": int(r["members"]),
            "total": int(r["total"]), "real": int(r["real"]), "inbox": int(r["inbox"]), "sent": int(r["sent"]),
            "drafts": int(r["drafts"]), "has_content": int(r["real"]) > 0,
            "last_activity": r["last_at"].isoformat() if r["last_at"] else None,
            "legal_hold": r["legal_hold"], "sending_suspended": r["sending_suspended"],
            "can_delete": reason is None, "delete_blocked_reason": reason,
        })
    free = await User.find_all().to_list()
    assignable = [{"id": str(u.id), "name": u.name, "email": u.email} for u in free if str(u.id) not in owned]
    assignable.sort(key=lambda u: (u["name"] or "").lower())
    return {"mailboxes": items, "assignable_users": assignable, "domain": domain}


async def _domain() -> str:
    from app.modules.mail.core_service import _domain as domain

    return await domain()


def _delete_block_reason(local_part: str, legal_hold: bool, kind: str, owner_exists: bool) -> str | None:
    if str(local_part).lower() in _PROTECTED:
        return "System address; it cannot be deleted."
    if legal_hold:
        return "Under legal hold."
    if kind == "personal" and owner_exists:
        return "Its owner still exists. Reassign or rename it, or delete the user first."
    return None


async def preview(mailbox_id: str, limit: int = 15) -> list[dict[str, Any]]:
    pool = db.get_pool()
    rows = await pool.fetch(
        """SELECT mm.folder, mm.received_at, m.subject, m.from_address, m.origin
             FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
            WHERE mm.mailbox_id=$1 ORDER BY mm.received_at DESC LIMIT $2""",
        mailbox_id, limit,
    )
    return [{"folder": r["folder"], "at": r["received_at"].isoformat(), "subject": r["subject"] or "(no subject)",
             "from": r["from_address"], "system": r["origin"] == "internal"} for r in rows]


async def rename(actor: str, mailbox_id: str, new_local: str) -> dict[str, Any]:
    import asyncpg

    local = _local_part(new_local or "")
    if not local or local in _PROTECTED:
        raise Forbidden("Choose a different address; this one is empty or reserved.")
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow("SELECT local_part::text AS local_part FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("Mailbox not found.")
            if str(box["local_part"]).lower() in _PROTECTED:
                raise Forbidden("System addresses cannot be renamed.")
            try:
                await conn.execute("UPDATE mailbox SET local_part=$2 WHERE id=$1", mailbox_id, local)
            except asyncpg.UniqueViolationError:
                raise Conflict("That address is already taken by a mailbox or alias.") from None
            await _audit(conn, actor, "mail.mailbox.rename", mailbox_id, detail={"from": box["local_part"], "to": local})
    return {"local_part": local, "address": f"{local}@{await _domain()}"}


async def reassign(actor: str, mailbox_id: str, user_id: str) -> dict[str, Any]:
    pool = db.get_pool()
    target = (await _users_by_id([user_id])).get(user_id)
    if not target:
        raise NotFound("That user no longer exists.")
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow("SELECT id, kind, owner_user_id, local_part::text AS local_part FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("Mailbox not found.")
            if box["kind"] != "personal":
                raise Forbidden("Only personal mailboxes are reassigned; manage shared mailbox members instead.")
            if str(box["local_part"]).lower() in _PROTECTED:
                raise Forbidden("System addresses cannot be reassigned.")
            has = await conn.fetchval("SELECT local_part::text FROM mailbox WHERE kind='personal' AND owner_user_id=$1 AND id<>$2", user_id, mailbox_id)
            if has:
                raise Conflict(f"{target.name} already has the mailbox {has}. Delete it (optionally moving its mail) or rename it first.")
            await conn.execute("DELETE FROM mailbox_member WHERE mailbox_id=$1 AND role='owner'", mailbox_id)
            await conn.execute(
                "UPDATE mailbox SET owner_user_id=$2, state='open', closed_at=NULL, display_name=$3 WHERE id=$1",
                mailbox_id, user_id, str(target.name)[:160],
            )
            await conn.execute(
                "INSERT INTO mailbox_member(mailbox_id,user_id,role,added_by) VALUES($1,$2,'owner',$3) "
                "ON CONFLICT (mailbox_id,user_id) DO UPDATE SET role='owner'",
                mailbox_id, user_id, actor,
            )
            await _audit(conn, actor, "mail.mailbox.reassign", mailbox_id, detail={"from": box["owner_user_id"], "to": user_id})
    return {"ok": True}


async def _purge(conn: Any, mailbox_id: str, move_to: str | None) -> tuple[int, list[str]]:
    """Remove a mailbox inside the caller's transaction. Returns (messages removed, object keys to delete)."""
    moved = 0
    if move_to:
        moved = await conn.fetchval(
            "WITH ins AS (INSERT INTO mailbox_message(mailbox_id,message_id,folder,is_read,is_starred,trashed_at,received_at) "
            "SELECT $2,message_id,folder,is_read,is_starred,trashed_at,received_at FROM mailbox_message WHERE mailbox_id=$1 "
            "ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*) FROM ins", mailbox_id, move_to,
        )
        await conn.execute("UPDATE message_recipient SET mailbox_id=$2 WHERE mailbox_id=$1", mailbox_id, move_to)
        await conn.execute("UPDATE outbox SET from_mailbox_id=$2 WHERE from_mailbox_id=$1", mailbox_id, move_to)
        await conn.execute("UPDATE attachment SET uploader_mailbox_id=$2 WHERE uploader_mailbox_id=$1", mailbox_id, move_to)
    else:
        await conn.execute("UPDATE message_recipient SET mailbox_id=NULL WHERE mailbox_id=$1", mailbox_id)
        await conn.execute("UPDATE outbox SET from_mailbox_id=NULL WHERE from_mailbox_id=$1", mailbox_id)
    keys: list[str] = []
    # Uploads that were never attached to a message belong only to this mailbox.
    for r in await conn.fetch("DELETE FROM attachment WHERE uploader_mailbox_id=$1 AND message_id IS NULL RETURNING object_key", mailbox_id):
        if r["object_key"]:
            keys.append(r["object_key"])
    await conn.execute("UPDATE attachment SET uploader_mailbox_id=NULL WHERE uploader_mailbox_id=$1", mailbox_id)
    msg_ids = [r["message_id"] for r in await conn.fetch("DELETE FROM mailbox_message WHERE mailbox_id=$1 RETURNING message_id", mailbox_id)]
    removed = 0
    if msg_ids:
        gone = await conn.fetch(
            "SELECT m.id, m.raw_object_key FROM message m WHERE m.id = ANY($1::uuid[]) "
            "AND NOT EXISTS (SELECT 1 FROM mailbox_message x WHERE x.message_id=m.id) "
            "AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.message_id=m.id)", msg_ids,
        )
        ids = [r["id"] for r in gone]
        keys += [r["raw_object_key"] for r in gone if r["raw_object_key"]]
        if ids:
            keys += [r["object_key"] for r in await conn.fetch("SELECT object_key FROM attachment WHERE message_id = ANY($1::uuid[])", ids) if r["object_key"]]
            await conn.execute("DELETE FROM message WHERE id = ANY($1::uuid[])", ids)
        removed = len(msg_ids) if not move_to else len(msg_ids) - int(moved or 0)
    await conn.execute("DELETE FROM message_label WHERE mailbox_id=$1", mailbox_id)
    await conn.execute("DELETE FROM mailbox_alias WHERE mailbox_id=$1", mailbox_id)
    await conn.execute("DELETE FROM mailbox_member WHERE mailbox_id=$1", mailbox_id)
    await conn.execute("DELETE FROM mailbox WHERE id=$1", mailbox_id)
    return max(removed, 0), keys


async def _delete_objects(keys: list[str]) -> None:
    if not keys:
        return
    try:
        from app.core.storage import Bucket, get_storage

        storage = get_storage()
        for key in keys:
            try:
                await storage.delete(Bucket.MAIL, key)
            except Exception:
                log.warning("mail object cleanup failed for %s", key, exc_info=True)
    except Exception:
        log.warning("mail object cleanup skipped", exc_info=True)


async def delete_mailbox(actor: str, mailbox_id: str, *, confirm: str, move_to: str | None, purge: bool) -> dict[str, Any]:
    pool = db.get_pool()
    domain = await _domain()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow(
                "SELECT id, kind, owner_user_id, legal_hold, local_part::text AS local_part FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("Mailbox not found.")
            address = f"{box['local_part']}@{domain}"
            if (confirm or "").strip().lower() not in {address.lower(), str(box["local_part"]).lower()}:
                raise Forbidden("Type the full address to confirm deletion.")
            owner_exists = bool(box["owner_user_id"]) and bool(await _users_by_id([box["owner_user_id"]]))
            reason = _delete_block_reason(box["local_part"], box["legal_hold"], box["kind"], owner_exists)
            if reason:
                raise Forbidden(reason)
            if move_to:
                if move_to == mailbox_id:
                    raise Forbidden("Choose a different mailbox to move the mail into.")
                if not await conn.fetchval("SELECT 1 FROM mailbox WHERE id=$1 AND state='open'", move_to):
                    raise NotFound("The mailbox to move mail into was not found or is closed.")
            else:
                real = await conn.fetchval(
                    "SELECT count(*) FROM mailbox_message mm JOIN message m ON m.id=mm.message_id "
                    "WHERE mm.mailbox_id=$1 AND (mm.folder IN ('sent','drafts') OR m.origin <> 'internal')", mailbox_id)
                if int(real or 0) > 0 and not purge:
                    raise Conflict(f"{address} holds {real} message(s). Move them to another mailbox, or confirm permanent deletion.")
            removed, keys = await _purge(conn, mailbox_id, move_to)
            await _audit(conn, actor, "mail.mailbox.delete", None, detail={"address": address, "moved_to": move_to, "messages_removed": removed})
    await _delete_objects(keys)
    return {"deleted": address, "messages_removed": removed, "moved_to": move_to}


async def release_user_mailboxes(user_id: str) -> None:
    """Called when a user is deleted: free the address if it was never used, otherwise close it
    (hidden from the directory, still visible to the admin tool above)."""
    try:
        pool = db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                box = await conn.fetchrow(
                    "SELECT id, legal_hold FROM mailbox WHERE kind='personal' AND owner_user_id=$1 FOR UPDATE", user_id)
                keys: list[str] = []
                if box:
                    real = await conn.fetchval(
                        "SELECT count(*) FROM mailbox_message mm JOIN message m ON m.id=mm.message_id "
                        "WHERE mm.mailbox_id=$1 AND (mm.folder IN ('sent','drafts') OR m.origin <> 'internal')", box["id"])
                    if int(real or 0) == 0 and not box["legal_hold"]:
                        _, keys = await _purge(conn, box["id"], None)
                    else:
                        await conn.execute("UPDATE mailbox SET state='closed', closed_at=now() WHERE id=$1", box["id"])
                # Shared mailboxes never keep a deleted user, whatever their role. The personal
                # mailbox (owner row) is handled above: purged when empty, otherwise closed.
                await conn.execute(
                    "DELETE FROM mailbox_member WHERE user_id=$1 AND mailbox_id IN (SELECT id FROM mailbox WHERE kind='shared')",
                    user_id,
                )
                await conn.execute("DELETE FROM mailbox_member WHERE user_id=$1 AND role<>'owner'", user_id)
        await _delete_objects(keys if box else [])
    except Exception:
        log.warning("could not release mailbox for deleted user %s", user_id, exc_info=True)


# --------------------------------------------------------------------------------------------
# Shared mailboxes. Every operation below validates ids first, tolerates users that no longer
# exist (deleted, or their account was changed), and raises a plain, specific error instead of
# a database failure, so the admin screen can always say what actually went wrong.
# --------------------------------------------------------------------------------------------
_ROLES = {"owner", "send_as", "read_only"}
_LOCAL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$")


def _uuid(value: Any, what: str = "Mailbox") -> str:
    """Canonical uuid string, or NotFound (never a database error) for anything malformed."""
    try:
        return str(uuid.UUID(str(value).strip()))
    except (ValueError, AttributeError, TypeError):
        raise NotFound(f"{what} not found.") from None


def _role(value: Any) -> str:
    role = str(value or "").strip()
    if role not in _ROLES:
        raise Conflict("Choose a valid access level: owner, read and send, or read only.")
    return role


def describe_members(rows: list[Any], users: dict[str, Any]) -> list[dict[str, Any]]:
    """Member rows with the person's current name and email. A member whose user no longer
    exists is flagged `missing` so the screen can offer to remove it instead of showing an id."""
    out = []
    for m in rows:
        uid = str(m["user_id"])
        person = users.get(uid)
        out.append({
            "user_id": uid, "role": m["role"],
            "name": str(person.name) if person else None,
            "email": str(person.email) if person else None,
            "is_active": bool(getattr(person, "is_active", True)) if person else False,
            "missing": person is None,
        })
    return out


async def assignable_people() -> list[dict[str, Any]]:
    """Every active user (not a single page of them), for the assign dropdown."""
    from app.modules.auth.models import User

    people = await User.find({"is_active": True}).to_list()
    out = [{"id": str(u.id), "name": str(u.name or ""), "email": str(u.email or "")} for u in people]
    out.sort(key=lambda u: (u["name"].lower(), u["email"].lower()))
    return out


async def create_shared(actor: str, local_part: str, display_name: str) -> dict[str, Any]:
    import asyncpg

    local = _local_part(local_part or "")
    if not local or not _LOCAL_RE.match(local):
        raise Conflict("Use letters, numbers, dots or hyphens for the address name.", {"local_part": "Invalid address name."})
    if local in _PROTECTED:
        raise Forbidden("That address is reserved for the system.")
    name = (display_name or "").strip()[:160]
    if not name:
        raise Conflict("Enter a display name.", {"display_name": "Required."})
    domain = await _domain()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", local)
            taken = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM mailbox WHERE local_part=$1) OR EXISTS(SELECT 1 FROM mailbox_alias WHERE local_part=$1)", local)
            if taken:
                raise Conflict(f"{local}@{domain} is already used by a mailbox or alias.", {"local_part": "Already in use."})
            try:
                row = await conn.fetchrow("INSERT INTO mailbox(local_part,kind,display_name) VALUES($1,'shared',$2) RETURNING id,local_part::text AS local_part,display_name", local, name)
            except asyncpg.UniqueViolationError:
                raise Conflict(f"{local}@{domain} is already used by a mailbox or alias.", {"local_part": "Already in use."}) from None
            await _audit(conn, actor, "mail.shared.create", row["id"])
    return {"id": str(row["id"]), "address": f"{row['local_part']}@{domain}", "display_name": row["display_name"]}


async def assign_member(actor: str, mailbox_id: str, user_id: str, role: str) -> dict[str, Any]:
    mailbox_id = _uuid(mailbox_id)
    role = _role(role)
    target = (await _users_by_id([str(user_id)])).get(str(user_id))
    if not target:
        raise NotFound("That user no longer exists. Refresh the page and choose someone else.")
    if not getattr(target, "is_active", True):
        raise Conflict(f"{target.name} is inactive. Reactivate the account before assigning a mailbox.")
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow("SELECT id, kind, state FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("That shared mailbox no longer exists. Refresh the page.")
            if box["kind"] != "shared":
                raise Forbidden("Only shared mailboxes take members. Use Reassign for personal mailboxes.")
            if box["state"] != "open":
                raise Conflict("That mailbox is closed. Members cannot be changed.")
            await conn.execute(
                "INSERT INTO mailbox_member(mailbox_id,user_id,role,added_by) VALUES($1,$2,$3,$4) "
                "ON CONFLICT (mailbox_id,user_id) DO UPDATE SET role=EXCLUDED.role, added_by=EXCLUDED.added_by",
                mailbox_id, str(user_id), role, actor,
            )
            await _audit(conn, actor, "mail.member.add", mailbox_id, detail={"user_id": str(user_id), "role": role})
    return {"updated": True}


async def unassign_member(actor: str, mailbox_id: str, user_id: str) -> dict[str, Any]:
    """Always works for a stale member (deleted user, changed account). Removing someone who is
    already gone is a success, not an error."""
    mailbox_id = _uuid(mailbox_id)
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow("SELECT id, kind FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("That shared mailbox no longer exists. Refresh the page.")
            if box["kind"] != "shared":
                raise Forbidden("Only shared mailbox members can be removed here.")
            gone = await conn.fetchval("WITH d AS (DELETE FROM mailbox_member WHERE mailbox_id=$1 AND user_id=$2 RETURNING 1) SELECT count(*) FROM d", mailbox_id, str(user_id))
            if int(gone or 0):
                await _audit(conn, actor, "mail.member.remove", mailbox_id, detail={"user_id": str(user_id)})
    return {"removed": True, "was_member": bool(int(gone or 0))}


async def close_shared(actor: str, mailbox_id: str) -> dict[str, Any]:
    mailbox_id = _uuid(mailbox_id)
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box = await conn.fetchrow("SELECT kind, state, local_part::text AS local_part FROM mailbox WHERE id=$1 FOR UPDATE", mailbox_id)
            if not box:
                raise NotFound("That shared mailbox no longer exists. Refresh the page.")
            if box["kind"] != "shared":
                raise Forbidden("Only shared mailboxes are closed here.")
            if str(box["local_part"]).lower() in _PROTECTED:
                raise Forbidden("System addresses cannot be closed.")
            if box["state"] == "closed":
                return {"closed": True, "already": True}
            await conn.execute("UPDATE mailbox SET state='closed', closed_at=now() WHERE id=$1", mailbox_id)
            await _audit(conn, actor, "mail.mailbox.close", mailbox_id)
    return {"closed": True}
