export interface Env {
  MAIL_RAW: R2Bucket;
  MAIL_INBOUND_URL: string;
  MAIL_INBOUND_SECRET: string;
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function signature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date();
    const key = `mail/inbound/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${id}.eml`;
    const raw = new Response(message.raw);
    const bytes = await raw.arrayBuffer();
    console.log(`inbound ${id} accepted bytes=${bytes.byteLength}`);
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Message too large');
    await env.MAIL_RAW.put(key, bytes, { httpMetadata: { contentType: 'message/rfc822' } });
    const payload = JSON.stringify({ id, object_key: key, envelope_from: message.from, envelope_to: [message.to], size_bytes: bytes.byteLength, received_at: now.toISOString() });
    const timestamp = String(Math.floor(Date.now()/1000));
    const sig = await signature(env.MAIL_INBOUND_SECRET, timestamp, payload);
    const response = await fetch(env.MAIL_INBOUND_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nest-timestamp': timestamp, 'x-nest-signature': sig }, body: payload });
    console.log(`backend ${id} -> HTTP ${response.status}`);
    if (!response.ok) throw new Error(`Mail backend rejected inbound message (${response.status})`);
  },
};
