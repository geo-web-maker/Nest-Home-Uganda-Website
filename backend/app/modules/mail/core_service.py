# ruff: noqa: E501,E701,E702
"""Transactional internal-mail primitives. External delivery is delegated to the outbox worker."""
from __future__ import annotations

import hashlib
import html
import re
import unicodedata
import uuid
from email.utils import parseaddr
from typing import Any

from app.modules.mail import db
from app.modules.mail.settings_service import get_value

_RESERVED = {"postmaster", "abuse", "admin", "administrator", "root", "webmaster", "hostmaster", "noreply", "no-reply", "mailer-daemon", "support"}
_EMAIL = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")


def _safe_header(value: str, field: str) -> str:
    value = value.strip()
    if "\r" in value or "\n" in value or len(value) > 998:
        raise ValueError(f"Invalid {field} header")
    return value


def _local_part(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    value = re.sub(r"[^a-z0-9.-]+", ".", value)
    return re.sub(r"[.-]{2,}", ".", value).strip(".-")[:64]


def _clean_html(value: str | None) -> str | None:
    if value is None:
        return None
    # Conservative allow-list: strip all tags rather than accepting unsafe markup.
    text = re.sub(r"(?is)<(script|style|iframe|object|svg|form)[^>]*>.*?</\1\s*>", "", value)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return f"<p>{html.escape(re.sub(r'\\s+', ' ', text).strip())}</p>"


async def _audit(conn: Any, actor: str | None, action: str, mailbox_id=None, message_id=None, detail=None):
    await conn.execute(
        "INSERT INTO mail_audit(actor_user_id,action,mailbox_id,message_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
        actor, action, mailbox_id, message_id, __import__('json').dumps(detail or {}),
    )


async def _assert_enabled():
    if not bool(await get_value("mail.enabled")):
        from app.core.errors import Forbidden
        raise Forbidden("Nest Mail is currently disabled by the organisation.")


async def _domain() -> str:
    value = str(await get_value("mail.domain") or "").strip().lower()
    if not value:
        raise ValueError("Set mail.domain in superadmin email settings before creating mailboxes.")
    return value


async def ensure_default_mailbox(user: Any):
    pool = db.get_pool()
    domain = await _domain()
    user_id = str(user.id)
    existing = await pool.fetchrow("SELECT * FROM mailbox WHERE owner_user_id=$1 AND kind='personal'", user_id)
    if existing:
        return dict(existing)
    pattern = str(await get_value("mail.address_pattern") or "{first}.{last}")
    bits = str(getattr(user, "name", "")).strip().split()
    staff_no = getattr(user, "staff_number", "") or ""
    if "{staff_no}" in pattern and not staff_no:
        try:
            from app.modules.nurses.models import NurseProfile
            profile = await NurseProfile.find_one(NurseProfile.user_id == user_id)
            staff_no = profile.staff_number if profile else ""
        except Exception:
            staff_no = ""
    values = {"first": bits[0] if bits else "", "last": bits[-1] if len(bits) > 1 else "", "staff_no": staff_no}
    candidate = _local_part(pattern.format(**values))
    if not candidate or candidate in _RESERVED:
        raise ValueError("User name cannot produce an available mailbox address.")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", candidate)
            for suffix in range(1, 10000):
                local = candidate if suffix == 1 else f"{candidate}{suffix}"
                used = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox WHERE local_part=$1) OR EXISTS(SELECT 1 FROM mailbox_alias WHERE local_part=$1)", local)
                if not used:
                    row = await conn.fetchrow(
                        "INSERT INTO mailbox(local_part,kind,owner_user_id,display_name,state,closed_at) VALUES($1,'personal',$2,$3,$4,CASE WHEN $4='closed' THEN now() ELSE NULL END) RETURNING *",
                        local, user_id, str(getattr(user, "name", ""))[:160], "open" if getattr(user,"is_active",True) else "closed",
                    )
                    await conn.execute("INSERT INTO mailbox_member(mailbox_id,user_id,role,added_by) VALUES($1,$2,'owner',$2)", row['id'], user_id)
                    await _audit(conn, user_id, "mail.mailbox.create", row['id'], detail={"kind":"personal"})
                    welcome=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,origin) VALUES($1,'Nest Home Care','Welcome to Nest Mail','Your Nest mailbox is ready. Use it for approved work communication. Do not send client details to outside addresses.','internal') RETURNING id",f"no-reply@{domain}")
                    await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox')",row['id'],welcome)
                    return dict(row)
    raise ValueError("Unable to allocate a unique mailbox address.")


async def list_mailboxes(user_id: str):
    await _assert_enabled()
    pool = db.get_pool()
    domain = await _domain()
    rows = await pool.fetch("""
      SELECT b.id,b.local_part,b.kind,b.display_name,b.state,m.role,
        (SELECT count(*) FROM mailbox_message mm WHERE mm.mailbox_id=b.id AND mm.folder='inbox' AND NOT mm.is_read) unread_count
      FROM mailbox b JOIN mailbox_member m ON m.mailbox_id=b.id
      WHERE m.user_id=$1 AND b.state='open' ORDER BY (b.kind='personal') DESC,b.display_name
    """, user_id)
    return [{**dict(r), "address": f"{r['local_part']}@{domain}"} for r in rows]


async def _membership(conn: Any, mailbox_id: str, user_id: str, *, send=False):
    await _assert_enabled()
    row = await conn.fetchrow("SELECT b.*,m.role FROM mailbox b JOIN mailbox_member m ON m.mailbox_id=b.id WHERE b.id=$1 AND m.user_id=$2", mailbox_id, user_id)
    if not row or row['state'] != 'open' or (send and row['role'] not in ('owner','send_as')):
        from app.core.errors import NotFound, Forbidden
        if not row: raise NotFound("Mailbox not found.")
        raise Forbidden("You do not have permission to use this mailbox.")
    return row


async def list_messages(user_id: str, mailbox_id: str, folder: str, q: str | None, limit: int = 50, before: str | None = None):
    await _assert_enabled()
    if folder not in {"inbox","sent","drafts","trash","spam","starred"}:
        raise ValueError("Unknown mail folder")
    pool = db.get_pool()
    async with pool.acquire() as conn:
        await _membership(conn, mailbox_id, user_id)
        params: list[Any] = [mailbox_id]
        where = "mm.mailbox_id=$1"
        if folder == "starred": where += " AND mm.is_starred=true"
        else:
            params.append(folder); where += f" AND mm.folder=${len(params)}"
        if q:
            params.append(q.strip()); where += f" AND (m.search @@ plainto_tsquery('simple',${len(params)}) OR m.subject ILIKE '%'||${len(params)}||'%')"
        if before:
            params.append(before); where += f" AND mm.received_at < ${len(params)}::timestamptz"
        params.append(max(1,min(limit,100)))
        rows = await conn.fetch(f"""SELECT mm.id mailbox_message_id,mm.folder,mm.is_read,mm.is_starred,mm.received_at,
          m.id message_id,m.from_address,m.from_name,m.subject,m.body_text,m.origin,m.size_bytes
          FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE {where}
          ORDER BY mm.received_at DESC LIMIT ${len(params)}""", *params)
        return [dict(r) for r in rows]


async def read_message(user_id: str, item_id: str):
    await _assert_enabled()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""SELECT mm.*,m.* FROM mailbox_message mm JOIN message m ON m.id=mm.message_id
              JOIN mailbox_member mem ON mem.mailbox_id=mm.mailbox_id WHERE mm.id=$1 AND mem.user_id=$2""", item_id,user_id)
            if not row:
                from app.core.errors import NotFound
                raise NotFound("Message not found.")
            await conn.execute("UPDATE mailbox_message SET is_read=true WHERE id=$1", item_id)
            await _audit(conn,user_id,"mail.read",row['mailbox_id'],row['message_id'])
            if row['folder'] in ('drafts','sent'):
                # The sender's own copy keeps its Bcc list, so a reopened draft does not lose it.
                recipients = await conn.fetch("SELECT kind,address,name FROM message_recipient WHERE message_id=$1", row['message_id'])
            else:
                recipients = await conn.fetch("SELECT kind,address,name FROM message_recipient WHERE message_id=$1 AND (kind <> 'bcc' OR (kind='bcc' AND address=$2))", row['message_id'],row['from_address'])
            attachments = await conn.fetch("SELECT id,filename,content_type,size_bytes,scan_state FROM attachment WHERE message_id=$1",row['message_id'])
            # SELECT mm.*,m.* repeats "id": the later (message) id wins, so name the mailbox-message id explicitly.
            return {**dict(row),"mailbox_message_id":str(item_id),"recipients":[dict(x) for x in recipients],"attachments":[dict(x) for x in attachments]}


async def create_draft(user_id: str, mailbox_id: str, payload: dict[str,Any], draft_id: str | None = None):
    await _assert_enabled()
    pool=db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box=await _membership(conn,mailbox_id,user_id,send=True)
            subject=_safe_header(str(payload.get('subject','')),'subject')
            text=str(payload.get('body_text',''))
            max_message=int(await get_value('mail.max_message_mb'))*1024*1024
            if len(text.encode()) > max_message: raise ValueError("Message exceeds the configured maximum.")
            if draft_id:
                row=await conn.fetchrow("SELECT message_id FROM mailbox_message WHERE id=$1 AND mailbox_id=$2 AND folder='drafts'",draft_id,mailbox_id)
                if not row:
                    from app.core.errors import NotFound
                    raise NotFound("Draft not found.")
                mid=row['message_id']
                await conn.execute("UPDATE message SET subject=$2,body_text=$3,body_html=$4,size_bytes=$5,in_reply_to=$6 WHERE id=$1",mid,subject,text,_clean_html(payload.get('body_html')),len(text.encode()),payload.get('in_reply_to'))
                await conn.execute("DELETE FROM message_recipient WHERE message_id=$1",mid)
            else:
                mid=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,body_html,origin,size_bytes,in_reply_to) VALUES($1,$2,$3,$4,$5,'internal',$6,$7) RETURNING id",f"{box['local_part']}@{await _domain()}",box['display_name'],subject,text,_clean_html(payload.get('body_html')),len(text.encode()),payload.get('in_reply_to'))
                await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'drafts')",mailbox_id,mid)
            for kind in ('to','cc','bcc'):
                for addr in payload.get(kind,[]) or []:
                    address=_safe_header(str(addr),'recipient').lower()
                    if not _EMAIL.fullmatch(address): raise ValueError("Invalid recipient address")
                    await conn.execute("INSERT INTO message_recipient(message_id,kind,address) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",mid,kind,address)
            return {"id":str(mid),"status":"draft"}


async def send_draft(user_id: str, draft_id: str, mailbox_id: str):
    await _assert_enabled()
    pool=db.get_pool(); domain=await _domain()
    async with pool.acquire() as conn:
        async with conn.transaction():
            box=await _membership(conn,mailbox_id,user_id,send=True)
            draft=await conn.fetchrow("SELECT mm.message_id,mm.folder,m.* FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE mm.id=$1 AND mm.mailbox_id=$2 AND mm.folder IN ('drafts','sent') FOR UPDATE",draft_id,mailbox_id)
            if draft and draft['folder']=='sent': return {"message_id":str(draft['message_id']),"already_sent":True}
            if not draft:
                from app.core.errors import NotFound
                raise NotFound("Draft not found.")
            signature=await conn.fetchval("SELECT body_text FROM mailbox_signature WHERE mailbox_id=$1",mailbox_id)
            if signature and signature.strip():
                await conn.execute("UPDATE message SET body_text=body_text||E'\\n\\n' || $2 WHERE id=$1",draft['message_id'],signature)
            if draft['in_reply_to']:
                parent=await conn.fetchrow("SELECT id,thread_id FROM message WHERE message_id_header=$1 OR id::text=$1 LIMIT 1",draft['in_reply_to'])
                if parent: await conn.execute("UPDATE message SET thread_id=COALESCE($2,$3) WHERE id=$1",draft['message_id'],parent['thread_id'],parent['id'])
            else:
                await conn.execute("UPDATE message SET thread_id=COALESCE(thread_id,id) WHERE id=$1",draft['message_id'])
            all_recipients=await conn.fetch("SELECT kind,address FROM message_recipient WHERE message_id=$1 ORDER BY CASE kind WHEN 'to' THEN 1 WHEN 'cc' THEN 2 ELSE 3 END",draft['message_id'])
            recipients=[]; seen=set()
            for recipient in all_recipients:
                address=recipient['address'].lower()
                if address not in seen:
                    seen.add(address); recipients.append(recipient)
            if not recipients: raise ValueError("Add at least one recipient before sending.")
            if len(recipients)>int(await get_value('mail.message_recipient_limit')): raise ValueError("Recipient limit exceeded.")
            local_domains={domain,*[str(x).lower() for x in (await get_value('mail.accepted_domains') or [])]}
            external=[]; local=[]
            for r in recipients:
                addr=r['address'].lower(); localpart,_,dom=addr.partition('@')
                if dom in local_domains:
                    target=await conn.fetchrow("SELECT id,state FROM mailbox WHERE local_part=$1 UNION ALL SELECT b.id,b.state FROM mailbox_alias a JOIN mailbox b ON b.id=a.mailbox_id WHERE a.local_part=$1 LIMIT 1",localpart)
                    if target and target['state']=='open':
                        local.append((target['id'],addr))
                        await conn.execute("UPDATE message_recipient SET mailbox_id=$3 WHERE message_id=$1 AND address=$2",draft['message_id'],addr,target['id'])
                    else:
                        reason="This mailbox is closed." if target else "No such mailbox."
                        bounce=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,origin) VALUES($1,'Mail Delivery Subsystem','Delivery status notification', $2,'internal') RETURNING id",f"mailer-daemon@{domain}",reason)
                        await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",mailbox_id,bounce)
                else: external.append(addr)
            if external:
                global_enabled=bool(await get_value('mail.external_enabled'))
                allowed=global_enabled and box['external_allowed'] is not False
                if not allowed or box['sending_suspended'] or bool(await get_value('mail.suspend_all_sending')):
                    raise ValueError("External sending is disabled or suspended for this mailbox.")
                suppressed=await conn.fetch("SELECT address FROM suppression WHERE address=ANY($1::citext[])",external)
                local_blocks=await conn.fetch("SELECT address FROM mailbox_blocked_sender WHERE mailbox_id=$1 AND address=ANY($2::citext[])",mailbox_id,external)
                blocked={str(r['address']).lower() for r in [*suppressed,*local_blocks]}
                suppressed_addresses=[x for x in external if x in blocked]
                external=[x for x in external if x not in blocked]
                if suppressed_addresses:
                    notice=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,origin) VALUES($1,'Nest Home Care','Some recipients were not sent','One or more recipients are suppressed or blocked for this mailbox. No external message was sent to those addresses.','internal') RETURNING id",f"no-reply@{domain}")
                    await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox')",mailbox_id,notice)
                if external:
                    await conn.execute("UPDATE message SET origin='outbound' WHERE id=$1",draft['message_id'])
                    daily_limit=int(await get_value('mail.mailbox_daily_external_limit'))
                    day_count=await conn.fetchval("INSERT INTO send_counter(scope,window_kind,window_start,count) VALUES($1,'day',current_date,$2) ON CONFLICT(scope,window_kind,window_start) DO UPDATE SET count=send_counter.count+EXCLUDED.count RETURNING count",f"mailbox:{mailbox_id}",len(external))
                    if int(day_count)>daily_limit: raise ValueError("This mailbox has reached its daily external recipient limit.")
                    key=hashlib.sha256((str(draft['message_id'])+'|'+','.join(sorted(external))).encode()).hexdigest()
                    await conn.execute("INSERT INTO outbox(message_id,from_mailbox_id,to_addresses,idempotency_key,priority) VALUES($1,$2,$3,$4,5) ON CONFLICT(idempotency_key) DO NOTHING",draft['message_id'],mailbox_id,external,key)
            for target,_ in local:
                await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",target,draft['message_id'])
            for recipient in recipients:
                await conn.execute("INSERT INTO mailbox_contact(mailbox_id,address,last_used_at) VALUES($1,$2,now()) ON CONFLICT(mailbox_id,address) DO UPDATE SET last_used_at=now()",mailbox_id,recipient['address'])
            await conn.execute("UPDATE mailbox_message SET folder='sent',is_read=true WHERE id=$1",draft_id)
            await _audit(conn,user_id,'mail.send',mailbox_id,draft['message_id'],{"local":len(local),"external":len(external)})
            return {"message_id":str(draft['message_id']),"local_deliveries":len(local),"external_queued":len(external)}


async def ensure_default_mailbox_if_configured(user: Any):
    """Account lifecycle hook: never make Mongo account creation depend on optional mail infra."""
    if not str(await get_value("mail.domain") or "").strip():
        return None
    return await ensure_default_mailbox(user)


async def close_personal_mailbox(user_id: str, closed: bool = True):
    pool=db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("UPDATE mailbox SET state=$2,closed_at=CASE WHEN $2='closed' THEN now() ELSE NULL END WHERE owner_user_id=$1 AND kind='personal' RETURNING id",user_id,"closed" if closed else "open")
        if row:
            await _audit(conn,user_id,"mail.mailbox.close" if closed else "mail.mailbox.reopen",row['id'])
        return dict(row) if row else None


async def add_name_alias(user: Any):
    pool=db.get_pool(); domain=await _domain(); user_id=str(user.id)
    box=await pool.fetchrow("SELECT id,local_part FROM mailbox WHERE owner_user_id=$1 AND kind='personal' AND state='open'",user_id)
    if not box: return None
    pattern=str(await get_value('mail.address_pattern') or '{first}.{last}')
    bits=str(getattr(user,'name','')).strip().split()
    staff_no=getattr(user,'staff_number','') or ''
    if '{staff_no}' in pattern and not staff_no:
        try:
            from app.modules.nurses.models import NurseProfile
            profile=await NurseProfile.find_one(NurseProfile.user_id == user_id)
            staff_no=profile.staff_number if profile else ''
        except Exception:
            staff_no=''
    base=_local_part(pattern.format(first=bits[0] if bits else '',last=bits[-1] if len(bits)>1 else '',staff_no=staff_no))
    if not base or base in _RESERVED: return None
    async with pool.acquire() as conn:
        async with conn.transaction():
            for suffix in range(1,10000):
                candidate=base if suffix==1 else f'{base}{suffix}'
                await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",candidate)
                used=await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox WHERE local_part=$1) OR EXISTS(SELECT 1 FROM mailbox_alias WHERE local_part=$1)",candidate)
                if not used:
                    await conn.execute("INSERT INTO mailbox_alias(mailbox_id,local_part) VALUES($1,$2)",box['id'],candidate)
                    await _audit(conn,user_id,'mail.mailbox.alias',box['id'],detail={'alias_added':True})
                    return f'{candidate}@{domain}'
    return None


async def remove_draft_attachment(user_id: str, draft_id: str, attachment_id: str) -> dict[str, Any]:
    """Detach and delete a file from a draft the person may send from. Sent mail is never changed."""
    from app.core.errors import NotFound

    await _assert_enabled()
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            draft = await conn.fetchrow("SELECT mailbox_id,message_id FROM mailbox_message WHERE id=$1 AND folder='drafts'", draft_id)
            if not draft:
                raise NotFound("Draft not found.")
            await _membership(conn, draft["mailbox_id"], user_id, send=True)
            attachment = await conn.fetchrow("SELECT id,object_key FROM attachment WHERE id=$1 AND message_id=$2", attachment_id, draft["message_id"])
            if not attachment:
                raise NotFound("Attachment not found on this draft.")
            await conn.execute("DELETE FROM attachment WHERE id=$1", attachment_id)
            await _audit(conn, user_id, "mail.attachment.remove", draft["mailbox_id"], draft["message_id"], {"attachment_id": str(attachment_id)})
    try:
        from app.core.storage import Bucket, get_storage

        await get_storage().delete(Bucket.MAIL, attachment["object_key"])
    except Exception:  # The row is gone, so the file can no longer be reached; a leftover object is cleaned up by retention.
        pass
    return {"removed": True}
