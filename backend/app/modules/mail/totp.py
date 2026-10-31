# ruff: noqa: E501,E701,E702
"""RFC 6238 TOTP and short-lived verified-session tokens; no SMS dependency."""
import base64, hashlib, hmac, secrets, struct, time
from app.modules.mail.settings_service import encrypt_secret, decrypt_secret
from app.modules.mail import db

def new_secret(): return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')
def code(secret: str, at: int | None = None) -> str:
    counter=int((at if at is not None else time.time())//30)
    key=base64.b32decode(secret+'='*((8-len(secret)%8)%8))
    digest=hmac.new(key,struct.pack('>Q',counter),hashlib.sha1).digest()  # noqa: S324 - RFC 6238 default algorithm
    offset=digest[-1]&15
    value=(struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%1_000_000
    return f'{value:06d}'
def verify(secret: str, supplied: str) -> bool:
    return any(hmac.compare_digest(code(secret,int(time.time())+shift*30),supplied) for shift in (-1,0,1))
async def enrol(user_id: str):
    secret=new_secret(); pool=db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO totp_secret(user_id,secret_encrypted,confirmed_at,recovery_hashes) VALUES($1,$2,NULL,'{}') ON CONFLICT(user_id) DO UPDATE SET secret_encrypted=EXCLUDED.secret_encrypted,confirmed_at=NULL,recovery_hashes='{}'",user_id,encrypt_secret(secret).encode())
    return secret
async def confirm(user_id: str, supplied: str):
    pool=db.get_pool()
    async with pool.acquire() as conn:
        row=await conn.fetchrow("SELECT secret_encrypted FROM totp_secret WHERE user_id=$1",user_id)
        if not row: return False
        secret=decrypt_secret(bytes(row['secret_encrypted']).decode())
        if not verify(secret,supplied): return False
        recovery=[secrets.token_hex(5) for _ in range(8)]
        hashes=[hashlib.sha256(x.encode()).hexdigest() for x in recovery]
        await conn.execute("UPDATE totp_secret SET confirmed_at=now(),recovery_hashes=$2 WHERE user_id=$1",user_id,hashes)
        return recovery
async def verified(user_id: str):
    pool=db.get_pool()
    async with pool.acquire() as conn:
        return bool(await conn.fetchval("SELECT confirmed_at IS NOT NULL FROM totp_secret WHERE user_id=$1",user_id))

async def verify_code_or_recovery(user_id: str, supplied: str) -> bool:
    """Verify a current TOTP or consume one single-use recovery code."""
    pool=db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row=await conn.fetchrow("SELECT secret_encrypted,confirmed_at,recovery_hashes FROM totp_secret WHERE user_id=$1 FOR UPDATE",user_id)
            if not row or not row['confirmed_at']: return False
            secret=decrypt_secret(bytes(row['secret_encrypted']).decode())
            if verify(secret,supplied): return True
            digest=hashlib.sha256(supplied.encode()).hexdigest()
            hashes=list(row['recovery_hashes'] or [])
            if digest not in hashes: return False
            hashes.remove(digest)
            await conn.execute("UPDATE totp_secret SET recovery_hashes=$2 WHERE user_id=$1",user_id,hashes)
            return True
