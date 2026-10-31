# ruff: noqa: E501,E701,E702
"""Authenticated Cloudflare Email Worker ingestion and conservative MIME processing."""
import hashlib, hmac, json, time, uuid
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from app.core.storage import Bucket, get_storage
from app.modules.mail import db
from app.modules.mail.settings_service import get_value

async def ingest(payload: dict, timestamp: str, signature: str):
    if not bool(await get_value('mail.enabled')) or not bool(await get_value('mail.inbound_enabled')): raise PermissionError('Inbound mail is disabled')
    secret=str(await get_value('mail.inbound_webhook_secret') or '')
    if not secret: raise PermissionError('Inbound webhook is not configured')
    if not timestamp.isdigit() or abs(int(time.time())-int(timestamp))>300: raise PermissionError('Expired inbound request')
    body=json.dumps(payload,separators=(',',':'),ensure_ascii=False)
    expected=hmac.new(secret.encode(),f'{timestamp}.{body}'.encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,signature): raise PermissionError('Invalid inbound signature')
    key=str(payload.get('object_key',''))
    if not key.startswith('mail/inbound/') or '..' in key: raise ValueError('Invalid raw object key')
    raw=await get_storage().get(Bucket.MAIL,key)
    if len(raw)>25*1024*1024: raise ValueError('Inbound message exceeds 25 MiB')
    parsed=BytesParser(policy=policy.default).parsebytes(raw)
    message_header=str(parsed.get('Message-ID') or '').strip()[:998]
    in_reply_to=str(parsed.get('In-Reply-To') or '').strip()[:998]
    pool=db.get_pool(); domain=str(await get_value('mail.domain') or '').lower()
    sender=parseaddr(str(parsed.get('From','')))[1].lower()
    subject=str(parsed.get('Subject',''))[:998]
    text_body=''; html_body=None; attachments=[]
    for part in parsed.walk():
        if part.is_multipart(): continue
        data=part.get_payload(decode=True) or b''
        filename=part.get_filename()
        if filename:
            name=filename.rsplit('/',1)[-1].rsplit('\\',1)[-1]
            blocked={x.strip().lower() for x in str(await get_value('mail.blocked_extensions')).split(',')}
            ext=name.rsplit('.',1)[-1].lower() if '.' in name else ''
            if ext in blocked: continue
            object_key=f"mail/attachments/{uuid.uuid4()}"
            await get_storage().put(Bucket.MAIL,object_key,data,part.get_content_type())
            attachments.append((object_key,name,part.get_content_type(),len(data),hashlib.sha256(data).hexdigest()))
        elif part.get_content_type()=='text/plain' and not text_body:
            text_body=data.decode(part.get_content_charset() or 'utf-8',errors='replace')[:2_000_000]
        elif part.get_content_type()=='text/html' and not html_body:
            # Strip active content and all markup before rendering; users can still read plain text.
            html_body=None
    envelope_to=[str(x).lower() for x in payload.get('envelope_to',[]) if isinstance(x,str)]
    async with pool.acquire() as conn:
        async with conn.transaction():
            duplicate=await conn.fetchval("SELECT EXISTS(SELECT 1 FROM message WHERE ($1::text IS NOT NULL AND message_id_header=$1) OR raw_object_key=$2)",message_header or None,key)
            if duplicate: return {'duplicate':True}
            msg_id=await conn.fetchval("INSERT INTO message(message_id_header,in_reply_to,thread_id,from_address,subject,body_text,body_html,origin,size_bytes,raw_object_key) VALUES($1,$2,(SELECT COALESCE(thread_id,id) FROM message WHERE message_id_header=$2 LIMIT 1),$3,$4,$5,$6,'inbound',$7,$8) RETURNING id",message_header or None,in_reply_to or None,sender,subject,text_body,html_body,len(raw),key)
            spam=0.0
            auth=payload.get('auth_results') or {}
            if str(auth.get('dmarc','')).lower()=='fail' and bool(await get_value('mail.quarantine_dmarc_fail')): spam=10.0
            folder='spam' if spam>=float(await get_value('mail.spam_score_threshold')) else 'inbox'
            for obj,name,ctype,size,digest in attachments:
                await conn.execute("INSERT INTO attachment(message_id,object_key,filename,content_type,size_bytes,sha256,scan_state) VALUES($1,$2,$3,$4,$5,$6,'unscanned')",msg_id,obj,name,ctype,size,digest)
            delivered=0
            for addr in envelope_to:
                local,sep,dom=addr.partition('@')
                if not sep or dom not in {domain,*[str(x).lower() for x in (await get_value('mail.accepted_domains') or [])]}: continue
                box=await conn.fetchrow("SELECT id,state FROM mailbox WHERE local_part=$1 UNION ALL SELECT b.id,b.state FROM mailbox_alias a JOIN mailbox b ON b.id=a.mailbox_id WHERE a.local_part=$1 LIMIT 1",local)
                if not box or box['state']!='open': continue
                await conn.execute("INSERT INTO message_recipient(message_id,kind,address,mailbox_id) VALUES($1,'to',$2,$3) ON CONFLICT DO NOTHING",msg_id,addr,box['id'])
                await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",box['id'],msg_id,folder)
                delivered+=1
            await conn.execute("UPDATE message SET spam_score=$2,auth_results=$3::jsonb WHERE id=$1",msg_id,spam,json.dumps(auth))
            return {'delivered':delivered,'folder':folder,'message_id':str(msg_id)}
