# ruff: noqa: E501,E701,E702
"""Durable, restart-safe external mail queue worker."""
import asyncio
import logging
from datetime import UTC, datetime, timedelta
from app.modules.mail import db
from app.modules.mail.providers import get_provider
from app.modules.mail.settings_service import get_value

log=logging.getLogger("app.mail.outbox")
BACKOFF=(60,300,1800,7200,21600)

async def drain(limit: int = 20) -> int:
    if not bool(await get_value("mail.enabled")) or bool(await get_value("mail.suspend_all_sending")): return 0
    pool=db.get_pool(); sent=0
    async with pool.acquire() as conn:
        async with conn.transaction():
            stale=await conn.fetch("SELECT id,to_addresses,counter_reserved,counter_day,counter_month FROM outbox WHERE state='sending' AND (claimed_at IS NULL OR claimed_at < now()-interval '10 minutes') FOR UPDATE SKIP LOCKED")
            for old in stale:
                if old['counter_reserved']:
                    count=len(old['to_addresses'])
                    await conn.execute("UPDATE send_counter SET count=greatest(0,count-$1) WHERE scope='provider' AND window_kind='day' AND window_start=$2",count,old['counter_day'])
                    await conn.execute("UPDATE send_counter SET count=greatest(0,count-$1) WHERE scope='provider' AND window_kind='month' AND window_start=$2",count,old['counter_month'])
                await conn.execute("UPDATE outbox SET state='deferred',next_attempt_at=now(),claimed_at=NULL,counter_reserved=false,counter_day=NULL,counter_month=NULL,last_error='worker lease expired' WHERE id=$1",old['id'])
            rows=await conn.fetch("""SELECT o.*,m.subject,m.body_text,m.body_html,b.local_part,b.sending_suspended,b.state mailbox_state
              FROM outbox o JOIN message m ON m.id=o.message_id LEFT JOIN mailbox b ON b.id=o.from_mailbox_id
              WHERE o.state IN ('queued','deferred') AND o.next_attempt_at<=now()
              ORDER BY o.priority,o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT $1""",max(1,min(limit,100)))
            ids=[r['id'] for r in rows]
            if ids: await conn.execute("UPDATE outbox SET state='sending',attempts=attempts+1,claimed_at=now() WHERE id=ANY($1::uuid[])",ids)
    for row in rows:
        reserved = False
        counter_day = None
        counter_month = None
        try:
            if row['mailbox_state'] == 'closed':
                async with pool.acquire() as conn:
                    await conn.execute("UPDATE outbox SET state='cancelled',claimed_at=NULL,last_error='sender mailbox closed' WHERE id=$1",row['id'])
                continue
            if not bool(await get_value('mail.external_enabled')) or row['sending_suspended']:
                async with pool.acquire() as conn:
                    await conn.execute("UPDATE outbox SET state='queued',next_attempt_at=now(),claimed_at=NULL WHERE id=$1",row['id'])
                continue
            provider_day=int(await get_value('mail.provider_daily_limit'))
            provider_month=int(await get_value('mail.provider_monthly_limit'))
            recipients=len(row['to_addresses'])
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute("SELECT pg_advisory_xact_lock($1)", 0x4E455354+1)
                    today=int(await conn.fetchval("SELECT coalesce(sum(count),0) FROM send_counter WHERE scope='provider' AND window_kind='day' AND window_start=current_date"))
                    month=int(await conn.fetchval("SELECT coalesce(sum(count),0) FROM send_counter WHERE scope='provider' AND window_kind='month' AND window_start=date_trunc('month',current_date)::date"))
                    if today+recipients>provider_day or month+recipients>provider_month:
                        next_time=await conn.fetchval("SELECT date_trunc($1,now()) + CASE WHEN $1='month' THEN interval '1 month' ELSE interval '1 day' END", "month" if month+recipients>provider_month else "day")
                        await conn.execute("UPDATE outbox SET state='deferred',next_attempt_at=$2,claimed_at=NULL WHERE id=$1",row['id'],next_time)
                        continue
                    await conn.execute("INSERT INTO send_counter(scope,window_kind,window_start,count) VALUES('provider','day',current_date,$1) ON CONFLICT(scope,window_kind,window_start) DO UPDATE SET count=send_counter.count+EXCLUDED.count",recipients)
                    await conn.execute("INSERT INTO send_counter(scope,window_kind,window_start,count) VALUES('provider','month',date_trunc('month',current_date)::date,$1) ON CONFLICT(scope,window_kind,window_start) DO UPDATE SET count=send_counter.count+EXCLUDED.count",recipients)
                    counter_day=await conn.fetchval("SELECT current_date")
                    counter_month=await conn.fetchval("SELECT date_trunc('month',current_date)::date")
                    await conn.execute("UPDATE outbox SET counter_reserved=true,counter_day=$2,counter_month=$3 WHERE id=$1",row['id'],counter_day,counter_month)
                    reserved=True
            provider=await get_provider()
            if provider.name == 'console':
                result=await provider.send(row['to_addresses'],row['subject'],row['body_html'],row['body_text'])
            else:
                domain=await get_value('mail.domain'); from_addr=f"{row['local_part']}@{domain}"
                result=await provider.send(row['to_addresses'],row['subject'],row['body_html'],row['body_text'],from_address=from_addr,from_name=await get_value('mail.from_name'),reply_to=await get_value('mail.reply_to'),idempotency_key=row['idempotency_key'])
            async with pool.acquire() as conn:
                if result.ok:
                    await conn.execute("UPDATE outbox SET state='sent',provider=$2,provider_message_id=$3,sent_at=now(),claimed_at=NULL,counter_reserved=false,counter_day=NULL,counter_month=NULL,last_error=NULL WHERE id=$1",row['id'],provider.name,result.provider_message_id); sent+=1
                else:
                    if reserved: await _release_counter_reservation(conn,len(row['to_addresses']),counter_day,counter_month,row['id'])
                    await _fail(conn,row,result.error or 'provider failure',result.retryable)
        except Exception as exc:
            async with pool.acquire() as conn:
                if reserved: await _release_counter_reservation(conn,len(row['to_addresses']),counter_day,counter_month,row['id'])
                await _fail(conn,row,type(exc).__name__,True)
            log.warning("mail outbox delivery failed id=%s type=%s",row['id'],type(exc).__name__)
        await asyncio.sleep(1/max(1,float(await get_value('mail.send_rate_per_second'))))
    return sent

async def _fail(conn,row,error,retryable):
    attempts=int(row['attempts'])+1
    if retryable and attempts < 6:
        delay=BACKOFF[min(attempts-1,len(BACKOFF)-1)]
        await conn.execute("UPDATE outbox SET state='deferred',next_attempt_at=$2,claimed_at=NULL,last_error=$3 WHERE id=$1",row['id'],datetime.now(UTC)+timedelta(seconds=delay),error[:300])
    else:
        await conn.execute("UPDATE outbox SET state='failed',claimed_at=NULL,last_error=$2 WHERE id=$1",row['id'],error[:300])
        if row.get('from_mailbox_id'):
            sender=await conn.fetchrow("SELECT id,local_part FROM mailbox WHERE id=$1",row['from_mailbox_id'])
            if sender:
                domain=str(await get_value('mail.domain') or 'invalid.local')
                notice=await conn.fetchval("INSERT INTO message(from_address,from_name,subject,body_text,origin) VALUES($1,'Mail Delivery Subsystem','Delivery failed','Your message could not be delivered. Review the recipient address or contact an administrator.','internal') RETURNING id",f"mailer-daemon@{domain}")
                await conn.execute("INSERT INTO mailbox_message(mailbox_id,message_id,folder) VALUES($1,$2,'inbox') ON CONFLICT DO NOTHING",sender['id'],notice)


async def _release_counter_reservation(conn, count: int, day, month, outbox_id):
    await conn.execute("UPDATE send_counter SET count=greatest(0,count-$1) WHERE scope='provider' AND window_kind='day' AND window_start=$2",count,day)
    await conn.execute("UPDATE send_counter SET count=greatest(0,count-$1) WHERE scope='provider' AND window_kind='month' AND window_start=$2",count,month)
    await conn.execute("UPDATE outbox SET counter_reserved=false,counter_day=NULL,counter_month=NULL WHERE id=$1",outbox_id)
