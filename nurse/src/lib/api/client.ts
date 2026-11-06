import { Capacitor } from '@capacitor/core';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../../platform/secureTokenStorage';
const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Resolve short-lived API asset paths against the configured API origin (including native builds). */
export function apiAssetUrl(path: string): string {
  const apiPath = path.startsWith('/api/v1/') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  return `${apiBase}${apiPath}`;
}
export type ApiError = { status: number; detail: string; code?: string; requestId?: string; endpoint?: string };

/** A static host answers POST with 405. Fail with a clear message when the API origin was never set at build time. */
function assertApiConfigured(): void {
  if (apiBase || Capacitor.isNativePlatform()) return;
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    throw { status: 0, detail: 'This app was built without an API address (VITE_API_URL). Rebuild it with VITE_API_URL set to the backend.' } satisfies ApiError;
  }
}

export async function restoreNativeSession(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;
  const response = await fetch(`${apiBase}/api/v1/auth/native/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'native' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 401 || response.status === 403) {
    await clearRefreshToken();
    return null;
  }
  if (!response.ok) throw new Error(`Session restore failed (${response.status})`);
  const refreshed = await response.json() as { access_token: string; refresh_token: string };
  if (!refreshed.access_token || !refreshed.refresh_token) throw new Error('Session restore returned an incomplete token response.');
  sessionStorage.setItem('nurse_access_token', refreshed.access_token);
  await saveRefreshToken(refreshed.refresh_token);
  return refreshed.access_token;
}
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('nurse_access_token');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (Capacitor.isNativePlatform() && path.startsWith('/auth/native/')) headers.set('X-Client','native');
  assertApiConfigured();
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/v1${path}`, { ...init, headers, credentials: apiBase ? 'include' : 'same-origin' });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw { status: 0, code: 'network_error', endpoint: `${init.method ?? 'GET'} /api/v1${path}`, detail: `Could not reach the API endpoint. No HTTP response was received. Check the API URL, internet connection, DNS/TLS and CORS configuration. Browser detail: ${reason}.` } satisfies ApiError;
  }
  if (response.status === 401 && Capacitor.isNativePlatform() && !path.startsWith('/auth/native/')) {
    const refreshToken=await readRefreshToken();
    if (refreshToken) {
      try {
        const refreshResponse=await fetch(`${apiBase}/api/v1/auth/native/refresh`,{method:'POST',headers:{'Content-Type':'application/json','X-Client':'native'},body:JSON.stringify({refresh_token:refreshToken})});
        if (refreshResponse.ok) { const refreshed=await refreshResponse.json() as {access_token:string;refresh_token:string}; sessionStorage.setItem('nurse_access_token',refreshed.access_token); await saveRefreshToken(refreshed.refresh_token); headers.set('Authorization',`Bearer ${refreshed.access_token}`); response=await fetch(`${apiBase}/api/v1${path}`,{...init,headers}); }
        else { await clearRefreshToken(); sessionStorage.removeItem('nurse_access_token'); }
      } catch { /* The outbox remains local until the network returns. */ }
    }
  }
  if (!response.ok) {
    let detail = `The API returned HTTP ${response.status} for ${init.method ?? 'GET'} ${path}.`;
    let code: string | undefined;
    let requestId = response.headers.get('X-Request-ID') ?? undefined;
    try {
      const body = await response.json() as { error?: { code?: string; message?: string; request_id?: string }; detail?: string; message?: string };
      detail = body.error?.message ?? body.detail ?? body.message ?? detail;
      code = body.error?.code;
      requestId = body.error?.request_id ?? requestId;
    } catch { /* proxy may return plain text or HTML */ }
    throw { status: response.status, detail, code, requestId, endpoint: `${init.method ?? 'GET'} /api/v1${path}` } satisfies ApiError;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
