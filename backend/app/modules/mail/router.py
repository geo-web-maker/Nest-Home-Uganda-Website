# ruff: noqa: E501,E701,E702
from fastapi import APIRouter, Cookie, Depends, Header, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import Principal, require_scopes
from app.core.errors import Forbidden
from app.modules.mail import service, core_service
from app.modules.mail import db as mail_db
from app.modules.mail.schemas import MailSettingsPatch

router = APIRouter(prefix="/mail", tags=["mail"])

def _valid_totp_cookie(principal: Principal, token: str | None) -> bool:
    if not token: return False
    try:
        import hashlib,hmac,time
        from app.modules.mail.settings_service import _fernet
        user_id,expires,sig=token.split(':',2)
        payload=f"{user_id}:{expires}"
        expected=hmac.new(_fernet()._signing_key,payload.encode(),hashlib.sha256).hexdigest()
        return user_id==principal.user_id and int(expires)>int(time.time()) and hmac.compare_digest(sig,expected)
    except Exception: return False

async def _require_sensitive_totp(principal: Principal, token: str | None, scope: str):
    from app.modules.mail.settings_service import get_value
    configured=str(await get_value("mail.require_totp_for_scopes") or "")
    required={item.strip() for item in configured.split(",") if item.strip()}
    if scope in required and not _valid_totp_cookie(principal,token):
        raise Forbidden("Verify your authenticator code to continue.")




@router.get("/settings")
async def get_mail_settings(
    principal: Principal = Depends(require_scopes("mail:settings:manage")),
    mail_totp: str | None = Cookie(default=None),
):
    await _require_sensitive_totp(principal, mail_totp, "mail:settings:manage")
    return await service.settings_list()


@router.patch("/settings")
async def patch_mail_settings(
    body: MailSettingsPatch,
    principal: Principal = Depends(require_scopes("mail:settings:manage")),
    mail_totp: str | None = Cookie(default=None),
):
    await _require_sensitive_totp(principal, mail_totp, "mail:settings:manage")
    return await service.update_settings(body.values, principal.user_id)


@router.post("/settings/{key}/reset")
async def reset_mail_setting(
    key: str,
    principal: Principal = Depends(require_scopes("mail:settings:manage")),
    mail_totp: str | None = Cookie(default=None),
):
    await _require_sensitive_totp(principal, mail_totp, "mail:settings:manage")
    return await service.reset_setting(key, principal.user_id)

# Internal-mail routes are kept in this router so registry and route-coverage tests see them.


class MailDraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mailbox_id: str
    to: list[str] = Field(default_factory=list, max_length=100)
    cc: list[str] = Field(default_factory=list, max_length=100)
    bcc: list[str] = Field(default_factory=list, max_length=100)
    subject: str = Field(default="", max_length=998)
    body_text: str = Field(default="", max_length=2_000_000)
    body_html: str | None = Field(default=None, max_length=2_000_000)
    in_reply_to: str | None = Field(default=None, max_length=998)


class SendDraftBody(BaseModel):
    mailbox_id: str


@router.get("/mailboxes")
async def mailboxes(principal: Principal = Depends(require_scopes("mail:use"))):
    return {"items": await core_service.list_mailboxes(principal.user_id)}


@router.get("/mailboxes/{mailbox_id}/messages")
async def messages(
    mailbox_id: str,
    folder: str = Query(default="inbox", pattern="^(inbox|sent|drafts|trash|spam|starred)$"),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    before: str | None = None,
    principal: Principal = Depends(require_scopes("mail:use")),
):
    return {"items": await core_service.list_messages(principal.user_id, mailbox_id, folder, q, limit, before)}


@router.get("/messages/{mailbox_message_id}")
async def read_message(mailbox_message_id: str, principal: Principal = Depends(require_scopes("mail:use"))):
    return await core_service.read_message(principal.user_id, mailbox_message_id)


@router.post("/drafts")
async def create_draft(body: MailDraftBody, principal: Principal = Depends(require_scopes("mail:use"))):
    return await core_service.create_draft(principal.user_id, body.mailbox_id, body.model_dump())


@router.put("/drafts/{draft_id}")
async def update_draft(draft_id: str, body: MailDraftBody, principal: Principal = Depends(require_scopes("mail:use"))):
    return await core_service.create_draft(principal.user_id, body.mailbox_id, body.model_dump(), draft_id)


@router.post("/drafts/{draft_id}/send")
async def send_draft(draft_id: str, body: SendDraftBody, principal: Principal = Depends(require_scopes("mail:use"))):
    result = await core_service.send_draft(principal.user_id, draft_id, body.mailbox_id)
    if result.get("external_queued"):
        from app.modules.mail.outbox import kick
        kick()
    return result


@router.post("/backfill/preview")
async def backfill_preview(principal: Principal = Depends(require_scopes("mail:settings:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.modules.auth.models import User
    from app.modules.mail.settings_service import get_value
    domain = await get_value("mail.domain")
    if not domain:
        raise Forbidden("Configure mail.domain before running mailbox backfill.")
    users = await User.find_all().to_list()
    pool = mail_db.get_pool()
    existing = {r["owner_user_id"] for r in await pool.fetch("SELECT owner_user_id FROM mailbox WHERE kind='personal'")}
    missing = [u for u in users if str(u.id) not in existing and (u.is_active or await get_value("mail.backfill_include_inactive"))]
    return {"count": len(missing), "sample": [u.name for u in missing[:10]]}


@router.post("/backfill/run")
async def backfill_run(principal: Principal = Depends(require_scopes("mail:settings:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.modules.auth.models import User
    from app.modules.mail.settings_service import get_value
    if not await get_value("mail.domain"):
        raise Forbidden("Configure mail.domain before running mailbox backfill.")
    include_inactive = bool(await get_value("mail.backfill_include_inactive"))
    users = await User.find_all().to_list()
    created, skipped = 0, []
    for offset in range(0, len(users), 200):
        for user in users[offset:offset + 200]:
            if not user.is_active and not include_inactive:
                skipped.append({"user_id": str(user.id), "reason": "inactive"}); continue
            try:
                await core_service.ensure_default_mailbox(user); created += 1
            except Exception as exc:
                skipped.append({"user_id": str(user.id), "reason": type(exc).__name__})
    pool = mail_db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,detail) VALUES($1,'mail.backfill',$2::jsonb)", principal.user_id, __import__('json').dumps({"created": created, "skipped": len(skipped)}))
    return {"created": created, "skipped": skipped}

class SharedMailboxBody(BaseModel):
    local_part: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9.-]+$")
    display_name: str = Field(min_length=1, max_length=160)

class MemberBody(BaseModel):
    role: str = Field(pattern="^(owner|send_as|read_only)$")

class MessagePatch(BaseModel):
    folder: str | None = Field(default=None, pattern="^(inbox|sent|drafts|trash|spam)$")
    is_read: bool | None = None
    is_starred: bool | None = None

@router.patch("/messages/{mailbox_message_id}")
async def patch_message(mailbox_message_id: str, body: MessagePatch, principal: Principal = Depends(require_scopes("mail:use"))):
    await core_service._assert_enabled()
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT mm.id,mm.mailbox_id FROM mailbox_message mm JOIN mailbox_member m ON m.mailbox_id=mm.mailbox_id WHERE mm.id=$1 AND m.user_id=$2",mailbox_message_id,principal.user_id)
        if not row: raise Forbidden("Message is not available to this mailbox.")
        changes=body.model_dump(exclude_unset=True)
        if changes:
            await conn.execute("UPDATE mailbox_message SET folder=COALESCE($2,folder),is_read=COALESCE($3,is_read),is_starred=COALESCE($4,is_starred),trashed_at=CASE WHEN $2='trash' THEN now() ELSE trashed_at END WHERE id=$1",mailbox_message_id,changes.get('folder'),changes.get('is_read'),changes.get('is_starred'))
    return {"updated": True}

@router.delete("/messages/{mailbox_message_id}")
async def delete_message(mailbox_message_id: str, principal: Principal = Depends(require_scopes("mail:use"))):
    await core_service._assert_enabled()
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT mm.id,mm.mailbox_id,mm.folder FROM mailbox_message mm JOIN mailbox_member m ON m.mailbox_id=mm.mailbox_id WHERE mm.id=$1 AND m.user_id=$2",mailbox_message_id,principal.user_id)
        if not row: raise Forbidden("Message is not available to this mailbox.")
        if row['folder']=='trash': await conn.execute("DELETE FROM mailbox_message WHERE id=$1",mailbox_message_id)
        else: await conn.execute("UPDATE mailbox_message SET folder='trash',trashed_at=now() WHERE id=$1",mailbox_message_id)
    return {"deleted": True}

@router.post("/shared")
async def create_shared(body: SharedMailboxBody, principal: Principal = Depends(require_scopes("mail:shared:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    from app.modules.mail.settings_service import get_value
    domain=await get_value('mail.domain')
    if not domain: raise Forbidden("Configure mail.domain first.")
    from app.modules.mail.core_service import _local_part
    local_part=_local_part(body.local_part)
    if not local_part: raise Forbidden("Shared mailbox address is invalid.")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row=await conn.fetchrow("INSERT INTO mailbox(local_part,kind,display_name) VALUES($1,'shared',$2) RETURNING *",local_part,body.display_name)
            await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id) VALUES($1,'mail.shared.create',$2)",principal.user_id,row['id'])
    return {"id":str(row['id']),"address":f"{row['local_part']}@{domain}","display_name":row['display_name']}

@router.get("/shared")
async def list_shared(principal: Principal = Depends(require_scopes("mail:shared:manage")), mail_totp: str | None = Cookie(default=None)):
    """Open shared mailboxes with their assigned members, for the shared-mailbox admin screen."""
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    from app.modules.mail.settings_service import get_value
    domain=str(await get_value('mail.domain') or '')
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        boxes=await conn.fetch("SELECT id,local_part,display_name FROM mailbox WHERE kind='shared' AND state='open' AND local_part<>'no-reply' ORDER BY local_part")
        members=await conn.fetch("SELECT mailbox_id,user_id,role FROM mailbox_member WHERE mailbox_id=ANY($1::uuid[]) ORDER BY added_at",[b['id'] for b in boxes]) if boxes else []
    by_box: dict[str,list[dict]]={}
    for m in members: by_box.setdefault(str(m['mailbox_id']),[]).append({"user_id":str(m['user_id']),"role":m['role']})
    return {"items":[{"id":str(b['id']),"local_part":b['local_part'],"address":f"{b['local_part']}@{domain}","display_name":b['display_name'],"members":by_box.get(str(b['id']),[])} for b in boxes]}

@router.put("/shared/{mailbox_id}/members/{user_id}")
async def set_member(mailbox_id: str,user_id: str,body: MemberBody,principal: Principal=Depends(require_scopes("mail:shared:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO mailbox_member(mailbox_id,user_id,role,added_by) SELECT id,$2,$3,$4 FROM mailbox WHERE id=$1 AND kind='shared' ON CONFLICT(mailbox_id,user_id) DO UPDATE SET role=EXCLUDED.role,added_by=EXCLUDED.added_by",mailbox_id,user_id,body.role,principal.user_id)
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.member.add',$2,jsonb_build_object('user_id',$3,'role',$4))",principal.user_id,mailbox_id,user_id,body.role)
    return {"updated":True}

@router.delete("/shared/{mailbox_id}/members/{user_id}")
async def remove_member(mailbox_id: str,user_id: str,principal: Principal=Depends(require_scopes("mail:shared:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM mailbox_member WHERE mailbox_id=$1 AND user_id=$2",mailbox_id,user_id)
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.member.remove',$2,jsonb_build_object('user_id',$3))",principal.user_id,mailbox_id,user_id)
    return {"removed":True}

@router.post("/shared/{mailbox_id}/close")
async def close_shared(mailbox_id: str,principal: Principal=Depends(require_scopes("mail:shared:manage")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("UPDATE mailbox SET state='closed',closed_at=now() WHERE id=$1 AND kind='shared' RETURNING id",mailbox_id)
        if not row: raise Forbidden("Shared mailbox not found.")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id) VALUES($1,'mail.mailbox.close',$2)",principal.user_id,mailbox_id)
    return {"closed":True}

@router.get("/archive/mailboxes")
async def archive_mailboxes(principal: Principal=Depends(require_scopes("mail:archive:read")), mail_totp: str | None = Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:archive:read")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        rows=await conn.fetch("SELECT id,local_part,kind,display_name,closed_at FROM mailbox WHERE state='closed' ORDER BY closed_at DESC")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,detail) VALUES($1,'mail.archive.open',jsonb_build_object('list',true))",principal.user_id)
    return {"items":[dict(r) for r in rows],"banner":"Archived mailbox. Access is logged."}

@router.get("/audit")
async def mail_audit(limit: int=Query(default=100,ge=1,le=500),principal: Principal=Depends(require_scopes("mail:audit:read"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        rows=await conn.fetch("SELECT id,at,actor_user_id,action,mailbox_id,message_id,detail FROM mail_audit ORDER BY at DESC LIMIT $1",limit)
    return {"items":[dict(r) for r in rows]}

@router.post("/inbound")
async def inbound_mail(request: Request, x_nest_timestamp: str = Header(default=""), x_nest_signature: str = Header(default="")):
    from app.modules.mail.inbound import ingest
    payload=await request.json()
    try:
        return await ingest(payload,x_nest_timestamp,x_nest_signature)
    except PermissionError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=401,detail="Invalid inbound authentication") from exc

class AttachmentPresignBody(BaseModel):
    mailbox_id: str
    filename: str = Field(min_length=1,max_length=255)
    content_type: str = Field(min_length=1,max_length=160)
    size_bytes: int = Field(gt=0)

@router.post("/attachments/presign")
async def attachment_presign(body: AttachmentPresignBody,principal: Principal=Depends(require_scopes("mail:use"))):
    from app.core.storage import Bucket,get_storage
    from app.modules.mail.core_service import _membership
    from app.modules.mail.settings_service import get_value
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        await _membership(conn,body.mailbox_id,principal.user_id,send=True)
    max_mb=int(await get_value('mail.max_attachment_mb'))
    if body.size_bytes>max_mb*1024*1024: raise Forbidden("Attachment exceeds the configured per-file limit.")
    if "\r" in body.filename or "\n" in body.filename: raise Forbidden("Invalid attachment filename.")
    safe_filename=body.filename.replace('\\','/').rsplit('/',1)[-1]
    if not safe_filename or safe_filename in {'.','..'}: raise Forbidden("Invalid attachment filename.")
    blocked={x.strip().lower() for x in str(await get_value('mail.blocked_extensions')).split(',')}
    ext=safe_filename.rsplit('.',1)[-1].lower() if '.' in safe_filename else ''
    quota=int(await get_value('mail.mailbox_quota_mb'))*1024*1024
    async with pool.acquire() as conn:
        used=await conn.fetchval("SELECT coalesce((SELECT sum(size_bytes) FROM message WHERE id IN (SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=$1)),0)+coalesce((SELECT sum(size_bytes) FROM attachment WHERE uploader_mailbox_id=$1 OR message_id IN (SELECT DISTINCT message_id FROM mailbox_message WHERE mailbox_id=$1)),0)",body.mailbox_id)
    if int(used or 0)+body.size_bytes>quota: raise Forbidden("Mailbox storage quota would be exceeded.")
    if ext in blocked: raise Forbidden("This attachment type is blocked.")
    import uuid
    key=f"mail/attachments/{uuid.uuid4()}"
    url=await get_storage().presigned_put(Bucket.MAIL,key,body.content_type,300)
    async with pool.acquire() as conn:
        aid=await conn.fetchval("INSERT INTO attachment(uploader_mailbox_id,object_key,filename,content_type,size_bytes,sha256,scan_state) VALUES($1,$2,$3,$4,$5,'pending','pending') RETURNING id",body.mailbox_id,key,safe_filename,body.content_type,body.size_bytes)
    return {"attachment_id":str(aid),"upload_url":url,"expires_seconds":300}

@router.post("/attachments/{attachment_id}/confirm")
async def attachment_confirm(attachment_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    from app.core.storage import Bucket,get_storage
    import hashlib
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT a.* FROM attachment a JOIN mailbox_member m ON m.mailbox_id=a.uploader_mailbox_id WHERE a.id=$1 AND m.user_id=$2",attachment_id,principal.user_id)
        if not row: raise Forbidden("Attachment not found.")
    data=await get_storage().get(Bucket.MAIL,row['object_key'])
    if len(data)!=row['size_bytes']: raise Forbidden("Uploaded attachment size does not match the reservation.")
    digest=hashlib.sha256(data).hexdigest()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE attachment SET sha256=$2,scan_state='unscanned' WHERE id=$1",attachment_id,digest)
    return {"confirmed":True,"sha256":digest}

@router.get("/attachments/{attachment_id}/download")
async def attachment_download(attachment_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    from app.core.storage import Bucket,get_storage
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("""SELECT a.* FROM attachment a WHERE a.id=$1 AND (
          EXISTS(SELECT 1 FROM mailbox_member m WHERE m.mailbox_id=a.uploader_mailbox_id AND m.user_id=$2) OR
          EXISTS(SELECT 1 FROM mailbox_message mm JOIN mailbox_member m ON m.mailbox_id=mm.mailbox_id WHERE mm.message_id=a.message_id AND m.user_id=$2))""",attachment_id,principal.user_id)
        if not row: raise Forbidden("Attachment not available.")
        blocked={x.strip().lower() for x in str(await __import__('app.modules.mail.settings_service',fromlist=['get_value']).get_value('mail.blocked_extensions')).split(',')}
        ext=str(row['filename']).rsplit('.',1)[-1].lower() if '.' in str(row['filename']) else ''
        if row['scan_state'] in ('blocked','infected') or ext in blocked: raise Forbidden("This attachment is not available for download.")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,message_id,detail) VALUES($1,'mail.attachment.download',$2,$3,jsonb_build_object('attachment_id',$4))",principal.user_id,row['uploader_mailbox_id'],row['message_id'],attachment_id)
    url=await get_storage().signed_url(Bucket.MAIL,row['object_key'],300)
    return {"download_url":url,"filename":row['filename'],"expires_seconds":300}

class TotpCodeBody(BaseModel):
    code: str = Field(min_length=6,max_length=32)

@router.post("/totp/enroll")
async def totp_enroll(principal: Principal=Depends(require_scopes("mail:use")),mail_totp: str | None=Cookie(default=None)):
    from app.modules.mail.totp import enrol,verified
    if await verified(principal.user_id) and not _valid_totp_cookie(principal,mail_totp): raise Forbidden("Verify your current authenticator before replacing it.")
    import urllib.parse
    secret=await enrol(principal.user_id)
    label=urllib.parse.quote(f"Nest Home Care:{principal.user_id}")
    uri=f"otpauth://totp/{label}?secret={secret}&issuer=Nest%20Home%20Care&algorithm=SHA1&digits=6&period=30"
    return {"secret":secret,"otpauth_uri":uri,"instructions":"Add this account to an authenticator app, then confirm with its current six-digit code. The secret is shown once."}

@router.post("/totp/reset")
async def totp_reset(body: TotpCodeBody,response: Response,principal: Principal=Depends(require_scopes("mail:use"))):
    """Remove this user's authenticator after proving it with a current code or a one-time recovery code."""
    from app.modules.mail.totp import verify_code_or_recovery
    if not await verify_code_or_recovery(principal.user_id,body.code): raise Forbidden("Authenticator code is invalid.")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM totp_secret WHERE user_id=$1",principal.user_id)
    response.delete_cookie("mail_totp",path="/")
    return {"reset":True}

@router.post("/totp/confirm")
async def totp_confirm(body: TotpCodeBody,principal: Principal=Depends(require_scopes("mail:use"))):
    from app.modules.mail.totp import confirm
    recovery=await confirm(principal.user_id,body.code)
    if recovery is False: raise Forbidden("Authenticator code is invalid.")
    return {"enabled":True,"recovery_codes":recovery,"warning":"Store these recovery codes securely. They are shown once."}

@router.post("/totp/verify")
async def totp_verify(body: TotpCodeBody,response: Response,principal: Principal=Depends(require_scopes("mail:use"))):
    from app.modules.mail.totp import verify_code_or_recovery,verified
    import hashlib,hmac,time
    if not await verified(principal.user_id): raise Forbidden("Set up authenticator verification first.")
    if not await verify_code_or_recovery(principal.user_id,body.code): raise Forbidden("Authenticator code is invalid.")
    key=__import__('app.modules.mail.settings_service',fromlist=['_fernet'])._fernet()._signing_key
    expires=int(time.time())+12*3600
    payload=f"{principal.user_id}:{expires}"
    sig=hmac.new(key,payload.encode(),hashlib.sha256).hexdigest()
    from app.core.config import get_settings
    cfg=get_settings()  # same cookie policy as login, so a cross-site frontend still sends it
    response.set_cookie("mail_totp",f"{payload}:{sig}",max_age=12*3600,httponly=True,secure=cfg.cookie_secure,samesite=cfg.cookie_samesite,path="/")
    return {"verified":True,"expires_in":43200}

@router.get("/archive/mailboxes/{mailbox_id}/messages")
async def archive_messages(mailbox_id: str,principal: Principal=Depends(require_scopes("mail:archive:read")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:archive:read")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        box=await conn.fetchrow("SELECT id FROM mailbox WHERE id=$1 AND state='closed'",mailbox_id)
        if not box: raise Forbidden("Closed mailbox not found.")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.archive.open',$2,jsonb_build_object('list',true))",principal.user_id,mailbox_id)
        rows=await conn.fetch("SELECT mm.id mailbox_message_id,mm.folder,mm.received_at,m.id message_id,m.from_address,m.subject,m.body_text FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE mm.mailbox_id=$1 ORDER BY mm.received_at DESC LIMIT 100",mailbox_id)
    return {"items":[dict(r) for r in rows],"read_only":True,"banner":"Archived mailbox. Access is logged."}

@router.get("/archive/messages/{message_id}")
async def archive_read_message(message_id: str,mailbox_id: str,principal: Principal=Depends(require_scopes("mail:archive:read")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:archive:read")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT m.*,mm.mailbox_id FROM message m JOIN mailbox_message mm ON mm.message_id=m.id JOIN mailbox b ON b.id=mm.mailbox_id WHERE m.id=$1 AND mm.mailbox_id=$2 AND b.state='closed'",message_id,mailbox_id)
        if not row: raise Forbidden("Archived message not found.")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,message_id) VALUES($1,'mail.archive.open',$2,$3)",principal.user_id,mailbox_id,message_id)
    return {**dict(row),"read_only":True,"banner":"Archived mailbox. Access is logged."}

class SharedPatchBody(BaseModel):
    display_name: str | None = Field(default=None,min_length=1,max_length=160)
    new_local_part: str | None = Field(default=None,min_length=1,max_length=64,pattern=r"^[a-zA-Z0-9.-]+$")

@router.patch("/shared/{mailbox_id}")
async def patch_shared(mailbox_id: str,body: SharedPatchBody,principal: Principal=Depends(require_scopes("mail:shared:manage")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:shared:manage")
    from app.modules.mail.settings_service import get_value
    domain=await get_value('mail.domain'); pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row=await conn.fetchrow("SELECT local_part FROM mailbox WHERE id=$1 AND kind='shared' AND state='open' FOR UPDATE",mailbox_id)
            if not row: raise Forbidden("Shared mailbox not found.")
            if body.display_name is not None: await conn.execute("UPDATE mailbox SET display_name=$2 WHERE id=$1",mailbox_id,body.display_name)
            if body.new_local_part:
                from app.modules.mail.core_service import _local_part
                new_local_part=_local_part(body.new_local_part)
                if not new_local_part: raise Forbidden("Shared mailbox address is invalid.")
                await conn.execute("UPDATE mailbox SET local_part=$2 WHERE id=$1",mailbox_id,new_local_part)
                await conn.execute("INSERT INTO mailbox_alias(mailbox_id,local_part) VALUES($1,$2)",mailbox_id,row['local_part'])
            await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.shared.update',$2,jsonb_build_object('alias_added',$3))",principal.user_id,mailbox_id,bool(body.new_local_part))
    return {"updated":True,"address":f"{new_local_part if body.new_local_part else row['local_part']}@{domain}"}

@router.post("/messages/{mailbox_message_id}/report-spam")
async def report_spam(mailbox_message_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    await core_service._assert_enabled()
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row=await conn.fetchrow("SELECT mm.mailbox_id,m.from_address FROM mailbox_message mm JOIN message m ON m.id=mm.message_id JOIN mailbox_member mb ON mb.mailbox_id=mm.mailbox_id WHERE mm.id=$1 AND mb.user_id=$2",mailbox_message_id,principal.user_id)
            if not row: raise Forbidden("Message not available.")
            await conn.execute("UPDATE mailbox_message SET folder='spam',trashed_at=now() WHERE id=$1",mailbox_message_id)
            if row['from_address'] and '@' in row['from_address']:
                await conn.execute("INSERT INTO mailbox_blocked_sender(mailbox_id,address) VALUES($1,$2) ON CONFLICT DO NOTHING",row['mailbox_id'],row['from_address'])
            await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.report_spam',$2,jsonb_build_object('mailbox_message_id',$3))",principal.user_id,row['mailbox_id'],mailbox_message_id)
    return {"reported":True}

@router.get("/usage")
async def mail_usage(principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        queue=await conn.fetchrow("SELECT count(*) FILTER(WHERE state IN ('queued','sending')) queued,count(*) FILTER(WHERE state='deferred') deferred,count(*) FILTER(WHERE state='failed') failed FROM outbox")
        day=await conn.fetchval("SELECT coalesce(sum(count),0) FROM send_counter WHERE scope='provider' AND window_kind='day' AND window_start=current_date")
        month=await conn.fetchval("SELECT coalesce(sum(count),0) FROM send_counter WHERE scope='provider' AND window_kind='month' AND window_start=date_trunc('month',current_date)::date")
        top=await conn.fetch("SELECT b.local_part,count(*) sent FROM outbox o JOIN mailbox b ON b.id=o.from_mailbox_id WHERE o.created_at>=date_trunc('month',now()) GROUP BY b.local_part ORDER BY sent DESC LIMIT 10")
    return {"today":int(day or 0),"month":int(month or 0),"queue":dict(queue),"top_mailboxes":[dict(r) for r in top]}

class TestSendBody(BaseModel):
    to: str = Field(min_length=3,max_length=254)

@router.post("/settings/test-send")
async def mail_test_send(body: TestSendBody,principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.modules.mail.providers import get_provider
    from app.modules.mail.settings_service import get_value
    import re
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+",body.to): raise Forbidden("Enter a valid test recipient address.")
    provider=await get_provider(); domain=await get_value('mail.domain')
    if provider.name=='console': return {"queued":False,"provider":"console","message":"Console provider records the test without sending external mail."}
    result=await provider.send([body.to],"Nest Home Care mail test","<p>Mail provider test.</p>","Mail provider test.",from_address=f"no-reply@{domain}",from_name=await get_value('mail.from_name'),reply_to=await get_value('mail.reply_to'),idempotency_key=f"test:{principal.user_id}:{__import__('uuid').uuid4()}")
    if not result.ok: raise Forbidden("Provider test failed. Check provider configuration and logs.")
    return {"sent":True,"provider":provider.name,"provider_message_id":result.provider_message_id}

_DIAGNOSTIC_KEYS = ("mail.enabled","mail.domain","mail.provider","mail.provider_api_key","mail.suspend_all_sending","mail.external_enabled","mail.inbound_enabled","mail.inbound_webhook_secret","mail.provider_webhook_secret")

async def _diagnostic_values() -> dict:
    from app.modules.mail.settings_service import get_value
    return {key: await get_value(key) for key in _DIAGNOSTIC_KEYS}

async def _own_mailbox(user_id: str):
    boxes = await core_service.list_mailboxes(user_id)
    return dict(boxes[0]) if boxes else None

@router.post("/diagnostics/run")
async def mail_diagnostics_run(principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    """Passive checks of settings, database, queue, file store and DNS. Sends nothing."""
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.core.storage import Bucket,get_storage
    from app.modules.mail import diagnostics
    checks=await diagnostics.run_passive_checks(await _diagnostic_values(),mail_db.get_pool(),get_storage(),Bucket.MAIL)
    return {"checks":[c.as_dict() for c in checks],"summary":diagnostics.summarize(checks)}

@router.post("/diagnostics/loopback")
async def mail_diagnostics_loopback(principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    """Sends a labelled message from the administrator's own mailbox to itself."""
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.modules.mail import diagnostics
    box=await _own_mailbox(principal.user_id)
    if not box: return {"check":diagnostics.Check("loopback",diagnostics.SKIP,"You do not have a mailbox to test with. Create one first.").as_dict()}
    return {"check":(await diagnostics.loopback(principal.user_id,box,mail_db.get_pool(),core_service)).as_dict()}

@router.post("/diagnostics/inbound")
async def mail_diagnostics_inbound(principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    """Pushes a signed message through the same ingest the email worker uses."""
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    from app.core.storage import Bucket,get_storage
    from app.modules.mail import diagnostics
    from app.modules.mail.inbound import ingest
    from app.modules.mail.settings_service import get_value
    box=await _own_mailbox(principal.user_id)
    if not box: return {"check":diagnostics.Check("inboundTest",diagnostics.SKIP,"You do not have a mailbox to test with. Create one first.").as_dict()}
    domain=str(await get_value('mail.domain') or '').lower(); secret=str(await get_value('mail.inbound_webhook_secret') or '')
    return {"check":(await diagnostics.inbound_selftest(box,domain,secret,mail_db.get_pool(),get_storage(),Bucket.MAIL,ingest)).as_dict()}

@router.post("/webhooks/{provider}")
async def mail_provider_webhook(provider: str,request: Request):
    import hashlib,hmac,base64,time
    from app.modules.mail.settings_service import get_value
    raw=await request.body(); secret=str(await get_value('mail.provider_webhook_secret') or '')
    if provider=='brevo':
        supplied=request.headers.get('x-brevo-signature','')
        expected=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
        valid=bool(supplied) and hmac.compare_digest(supplied,expected)
    elif provider=='resend':
        sid=request.headers.get('svix-id',''); ts=request.headers.get('svix-timestamp',''); sig=request.headers.get('svix-signature','')
        try:
            if abs(int(time.time())-int(ts))>300: raise ValueError
            key=base64.b64decode(secret.removeprefix('whsec_'))
            expected=base64.b64encode(hmac.new(key,f"{sid}.{ts}.".encode()+raw,hashlib.sha256).digest()).decode()
            valid=any(hmac.compare_digest(part.removeprefix('v1,'),expected) for part in sig.split())
        except Exception: valid=False
    else: raise Forbidden("Unknown mail provider webhook.")
    if not valid: raise Forbidden("Invalid provider webhook signature.")
    payload=await request.json(); event=str(payload.get('type') or payload.get('event') or '').lower()
    data=payload.get('data') if isinstance(payload.get('data'),dict) else payload
    address=str(data.get('email') or data.get('recipient') or '').lower()
    if address and ('bounce' in event or 'complaint' in event):
        reason='complaint' if 'complaint' in event else 'hard_bounce'
        pool=mail_db.get_pool()
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO suppression(address,reason) VALUES($1,$2) ON CONFLICT(address) DO UPDATE SET reason=EXCLUDED.reason",address,reason)
            await conn.execute("INSERT INTO mail_audit(action,detail) VALUES('mail.provider.webhook',$1::jsonb)",__import__('json').dumps({"provider":provider,"event":event}))
    return {"accepted":True}

@router.delete("/drafts/{draft_id}/attachments/{attachment_id}")
async def remove_draft_attachment(draft_id: str, attachment_id: str, principal: Principal = Depends(require_scopes("mail:use"))):
    return await core_service.remove_draft_attachment(principal.user_id, draft_id, attachment_id)

@router.post("/drafts/{draft_id}/attachments/{attachment_id}")
async def attach_to_draft(draft_id: str,attachment_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row=await conn.fetchrow("SELECT d.mailbox_id,d.message_id,a.uploader_mailbox_id,a.size_bytes,a.scan_state,m.size_bytes+coalesce((SELECT sum(ax.size_bytes) FROM attachment ax WHERE ax.message_id=m.id),0) message_size FROM mailbox_message d JOIN mailbox_member mb ON mb.mailbox_id=d.mailbox_id JOIN message m ON m.id=d.message_id JOIN attachment a ON a.id=$2 WHERE d.id=$1 AND d.folder='drafts' AND mb.user_id=$3 AND a.uploader_mailbox_id=d.mailbox_id",draft_id,attachment_id,principal.user_id)
            if not row or row['scan_state']=='pending': raise Forbidden("Draft or confirmed attachment not available.")
            from app.modules.mail.settings_service import get_value
            if int(row['message_size'])+int(row['size_bytes'])>int(await get_value('mail.max_message_mb'))*1024*1024: raise Forbidden("Message size limit would be exceeded.")
            await conn.execute("UPDATE attachment SET message_id=$2 WHERE id=$1",attachment_id,row['message_id'])
    return {"attached":True}

@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT d.message_id,d.mailbox_id FROM mailbox_message d JOIN mailbox_member m ON m.mailbox_id=d.mailbox_id WHERE d.id=$1 AND d.folder='drafts' AND m.user_id=$2",draft_id,principal.user_id)
        if not row: raise Forbidden("Draft not available.")
        await conn.execute("DELETE FROM mailbox_message WHERE id=$1",draft_id)
        if not await conn.fetchval("SELECT EXISTS(SELECT 1 FROM mailbox_message WHERE message_id=$1)",row['message_id']):
            await conn.execute("DELETE FROM message WHERE id=$1",row['message_id'])
    return {"deleted":True}

class ContactBody(BaseModel):
    address: str = Field(min_length=3,max_length=254)
    display_name: str = Field(default="",max_length=160)

class SignatureBody(BaseModel):
    body_text: str = Field(default="",max_length=10000)

class LabelBody(BaseModel):
    name: str = Field(min_length=1,max_length=40)
    colour: str = Field(default="neutral",pattern="^(neutral|green|blue|amber|red)$")

class AutoReplyBody(BaseModel):
    enabled: bool = False
    subject: str = Field(default="Out of office",max_length=998)
    body_text: str = Field(default="",max_length=10000)

@router.get("/contacts")
async def mail_contacts(q: str | None=None,mailbox_id: str | None=None,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        if mailbox_id:
            from app.modules.mail.core_service import _membership
            await _membership(conn,mailbox_id,principal.user_id)
            rows=await conn.fetch("SELECT address,display_name,last_used_at FROM mailbox_contact WHERE mailbox_id=$1 AND ($2::text IS NULL OR address::text ILIKE '%'||$2||'%' OR display_name ILIKE '%'||$2||'%') ORDER BY last_used_at DESC LIMIT 50",mailbox_id,q)
        else:
            rows=await conn.fetch("SELECT DISTINCT c.address,c.display_name,c.last_used_at FROM mailbox_contact c JOIN mailbox_member m ON m.mailbox_id=c.mailbox_id WHERE m.user_id=$1 AND ($2::text IS NULL OR c.address::text ILIKE '%'||$2||'%' OR c.display_name ILIKE '%'||$2||'%') ORDER BY c.last_used_at DESC LIMIT 50",principal.user_id,q)
    return {"items":[dict(r) for r in rows]}

@router.post("/contacts")
async def save_mail_contact(body: ContactBody,mailbox_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    import re
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+",body.address): raise Forbidden("Enter a valid email address.")
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        row=await conn.fetchrow("INSERT INTO mailbox_contact(mailbox_id,address,display_name) VALUES($1,$2,$3) ON CONFLICT(mailbox_id,address) DO UPDATE SET display_name=EXCLUDED.display_name,last_used_at=now() RETURNING address,display_name",mailbox_id,body.address.lower(),body.display_name)
    return dict(row)

@router.get("/mailboxes/{mailbox_id}/signature")
async def get_signature(mailbox_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        value=await conn.fetchval("SELECT body_text FROM mailbox_signature WHERE mailbox_id=$1",mailbox_id)
    return {"body_text":value or ""}

@router.put("/mailboxes/{mailbox_id}/signature")
async def put_signature(mailbox_id: str,body: SignatureBody,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id,send=True)
        await conn.execute("INSERT INTO mailbox_signature(mailbox_id,body_text) VALUES($1,$2) ON CONFLICT(mailbox_id) DO UPDATE SET body_text=EXCLUDED.body_text,updated_at=now()",mailbox_id,body.body_text)
    return {"saved":True}

@router.post("/mailboxes/{mailbox_id}/labels")
async def create_label(mailbox_id: str,body: LabelBody,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        row=await conn.fetchrow("INSERT INTO message_label(mailbox_id,name,colour) VALUES($1,$2,$3) ON CONFLICT(mailbox_id,name) DO UPDATE SET colour=EXCLUDED.colour RETURNING id,name,colour",mailbox_id,body.name,body.colour)
    return dict(row)

@router.post("/messages/{mailbox_message_id}/labels/{label_id}")
async def attach_label(mailbox_message_id: str,label_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT mm.id FROM mailbox_message mm JOIN mailbox_member m ON m.mailbox_id=mm.mailbox_id JOIN message_label l ON l.mailbox_id=mm.mailbox_id WHERE mm.id=$1 AND l.id=$2 AND m.user_id=$3",mailbox_message_id,label_id,principal.user_id)
        if not row: raise Forbidden("Message or label not available.")
        await conn.execute("INSERT INTO message_label_link(mailbox_message_id,label_id) VALUES($1,$2) ON CONFLICT DO NOTHING",mailbox_message_id,label_id)
    return {"attached":True}

@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str,mailbox_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        rows=await conn.fetch("SELECT mm.id mailbox_message_id,m.id message_id,m.from_address,m.subject,m.body_text,m.created_at FROM mailbox_message mm JOIN message m ON m.id=mm.message_id WHERE mm.mailbox_id=$1 AND (m.thread_id=$2 OR m.id::text=$2) ORDER BY m.created_at",mailbox_id,thread_id)
        if not rows: raise Forbidden("Thread not available.")
    return {"items":[dict(r) for r in rows]}

@router.get("/mailboxes/{mailbox_id}/auto-reply")
async def get_auto_reply(mailbox_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        row=await conn.fetchrow("SELECT enabled,subject,body_text,starts_at,ends_at FROM mailbox_auto_reply WHERE mailbox_id=$1",mailbox_id)
    return dict(row) if row else {"enabled":False,"subject":"Out of office","body_text":""}

@router.put("/mailboxes/{mailbox_id}/auto-reply")
async def put_auto_reply(mailbox_id: str,body: AutoReplyBody,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id,send=True)
        await conn.execute("INSERT INTO mailbox_auto_reply(mailbox_id,enabled,subject,body_text) VALUES($1,$2,$3,$4) ON CONFLICT(mailbox_id) DO UPDATE SET enabled=EXCLUDED.enabled,subject=EXCLUDED.subject,body_text=EXCLUDED.body_text,updated_at=now()",mailbox_id,body.enabled,body.subject,body.body_text)
    return {"saved":True}

@router.get("/mailboxes/{mailbox_id}/labels")
async def list_labels(mailbox_id: str,principal: Principal=Depends(require_scopes("mail:use"))):
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        from app.modules.mail.core_service import _membership
        await _membership(conn,mailbox_id,principal.user_id)
        rows=await conn.fetch("SELECT id,name,colour FROM message_label WHERE mailbox_id=$1 ORDER BY name",mailbox_id)
    return {"items":[dict(r) for r in rows]}

class MailboxPolicyBody(BaseModel):
    external_allowed: bool | None = None
    sending_suspended: bool | None = None
    follow_global: bool = False

@router.patch("/mailboxes/{mailbox_id}/policy")
async def mailbox_policy(mailbox_id: str,body: MailboxPolicyBody,principal: Principal=Depends(require_scopes("mail:settings:manage")),mail_totp: str | None=Cookie(default=None)):
    await _require_sensitive_totp(principal,mail_totp,"mail:settings:manage")
    values=body.model_dump(exclude_unset=True)
    if not values: return {"updated":False}
    pool=mail_db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("UPDATE mailbox SET external_allowed=CASE WHEN $4 THEN NULL WHEN $2::boolean IS NULL THEN external_allowed ELSE $2 END,sending_suspended=COALESCE($3,sending_suspended) WHERE id=$1 RETURNING id,external_allowed,sending_suspended",mailbox_id,values.get('external_allowed'),values.get('sending_suspended'),bool(values.get('follow_global',False)))
        if not row: raise Forbidden("Mailbox not found.")
        await conn.execute("INSERT INTO mail_audit(actor_user_id,action,mailbox_id,detail) VALUES($1,'mail.suspend',$2,$3::jsonb)",principal.user_id,mailbox_id,__import__('json').dumps(values))
    return dict(row)
