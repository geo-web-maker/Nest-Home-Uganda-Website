// Same-origin API proxy for bhcug.com.
// The browser calls https://bhcug.com/api/... and this Worker forwards it to the real backend, so
// a client's network, DNS or content blocker never sees a second (blockable) hostname, and CORS
// is not involved. Everything else is served from the static build (env.ASSETS).
//
// Set BACKEND_URL (wrangler.jsonc "vars" or the Cloudflare dashboard) to the backend base,
// including any mount prefix, e.g. https://YOUR-MULTI-HOST-DOMAIN/nest

const RETRY_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524]);
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function problem(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** The backend sets cookie paths that include its mount prefix (/nest). The browser sees none. */
function rewriteCookies(upstream, mountPrefix, headers) {
  const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  if (!cookies.length) return;
  headers.delete('set-cookie');
  for (const cookie of cookies) {
    let next = cookie.replace(/;\s*Domain=[^;]*/i, '');
    if (mountPrefix) next = next.replace(/(;\s*Path=)([^;]*)/i, (_m, lead, path) => `${lead}${path.startsWith(mountPrefix) ? path.slice(mountPrefix.length) || '/' : path}`);
    headers.append('set-cookie', next);
  }
}

async function proxy(request, env, url) {
  if (!env.BACKEND_URL) return problem(503, 'proxy_not_configured', 'The API address is not configured on the website.');
  let base;
  try { base = new URL(env.BACKEND_URL); } catch { return problem(503, 'proxy_not_configured', 'The API address is not valid.'); }
  const mountPrefix = base.pathname.replace(/\/$/, '');
  const target = `${base.origin}${mountPrefix}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  // The browser's Host (bhcug.com) must not travel to the backend: its Cloudflare edge answers
  // "Direct IP access not allowed" (error 1003) when Host and the address being called disagree.
  // Dropping it makes fetch() send the backend's own hostname. cf-* headers belong to this request only.
  headers.delete('host');
  for (const name of [...headers.keys()]) if (name.startsWith('cf-') && name !== 'cf-connecting-ip') headers.delete(name);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) { headers.set('x-forwarded-for', clientIp); headers.set('x-real-ip', clientIp); headers.set('cf-connecting-ip', clientIp); }
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');

  const hasBody = !SAFE_METHODS.has(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined; // buffered so a retry can resend it
  const attempts = SAFE_METHODS.has(request.method) ? 3 : 1;     // only retry requests that are safe to repeat

  let upstream = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
      if (!RETRY_STATUS.has(upstream.status) || attempt === attempts - 1) break;
    } catch {
      upstream = null;
    }
    await sleep(700 * (attempt + 1)); // gives a sleeping or restarting backend time to wake
  }
  if (!upstream) return problem(503, 'upstream_unreachable', 'Bloomwell is starting up. Please try again in a moment.');

  const out = new Headers(upstream.headers);
  out.set('cache-control', 'no-store');
  rewriteCookies(upstream, mountPrefix, out);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxy(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
