/** Cross-app handoff helper. Keep this file byte-identical to admin/src/admin-native/appSwitch.ts. */
export type AppName = 'admin' | 'nurse';
export type AppEntry = {
  allowed: boolean;
  url: string | null;
  android_package: string;
  apk_available: boolean;
  reason?: string | null;
};
export type AppAccess = { admin: AppEntry; nurse: AppEntry; handoff_enabled: boolean; suggestions_allowed?: boolean; automatic_sso?: { master_enabled: boolean; user_enabled: boolean; admin_allowed: boolean; effective_enabled: boolean } };
export type SessionBody = {
  access_token: string;
  refresh_token?: string;
  csrf_token?: string;
  user: { id: string; name: string; email: string; scopes: string[]; is_superadmin: boolean };
};
type Get = <T>(path: string) => Promise<T>;
type Post = <T>(path: string, body: unknown, headers?: Record<string, string>) => Promise<T>;
type NativeSwitch = { isInstalled: (packageName: string) => Promise<boolean>; launch: (packageName: string, scheme: string, code: string) => Promise<boolean> };
type SwitchDeps = { currentApp: AppName; get: Get; post: Post; fallbackUrl?: string; native?: NativeSwitch };

function safeConfiguredUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function fetchAppAccess(get: Get): Promise<AppAccess> {
  const result = await get<AppAccess>('/auth/app-access');
  try {
    if (result.admin.allowed && result.nurse.allowed) localStorage.setItem('nhc.dual_access', '1');
    else localStorage.removeItem('nhc.dual_access');
  } catch { /* Storage being unavailable must not block app access. */ }
  return result;
}

export async function pushToApp(target: AppName, deps: SwitchDeps): Promise<'navigated' | 'denied' | 'unavailable'> {
  let access: AppAccess | null = null;
  try { access = await fetchAppAccess(deps.get); } catch { /* The configured fallback remains useful if the access request is offline. */ }
  const entry = access?.[target];
  const targetUrl = safeConfiguredUrl(entry?.url ?? deps.fallbackUrl);
  if (entry && !entry.allowed) return 'denied';
  if (!targetUrl) return 'unavailable';
  if (!access?.handoff_enabled) {
    window.location.assign(targetUrl);
    return 'navigated';
  }
  try {
    const issued = await deps.post<{ code: string; expires_in: number }>('/auth/handoff', {
      source_app: deps.currentApp,
      target_app: target,
      mode: access?.automatic_sso?.effective_enabled ? 'automatic' : 'manual',
    });
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(issued.code)) throw new Error('The server returned an invalid handoff code.');
    if (deps.native) {
      try {
        const installed = await deps.native.isInstalled(entry?.android_package ?? '');
        if (installed && await deps.native.launch(entry?.android_package ?? '', `nhc-${target}`, issued.code)) return 'navigated';
      } catch { /* Missing app/plugin or a stale APK: use the existing web origin instead. */ }
    }
    window.location.assign(`${targetUrl}/#handoff=${encodeURIComponent(issued.code)}`);
    return 'navigated';
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    if (failure.status === 403 || failure.code === 'no_access_to_target') return 'denied';
    // Preserve the pre-existing link behaviour during network faults or while the backend is rolling out.
    window.location.assign(targetUrl);
    return 'unavailable';
  }
}

/** Read and synchronously erase a handoff fragment before any asynchronous work begins. */
export function readHandoffFromLocation(): { code: string } | { error: string } | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#handoff=') && !hash.startsWith('#handoff_error=')) return null;
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', cleanUrl);
  if (hash.startsWith('#handoff_error=')) return { error: hash.slice('#handoff_error='.length).slice(0, 80) || 'no_session' };
  const code = hash.slice('#handoff='.length);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return { error: 'invalid_link' };
  return { code };
}

export async function redeem(code: string, app: AppName, deps: { post: Post; native?: boolean }): Promise<SessionBody> {
  let verifier: string | null = null;
  try { verifier = sessionStorage.getItem('nhc.handoff.verifier'); } catch { /* No PKCE verifier on a push handoff. */ }
  try { sessionStorage.removeItem('nhc.handoff.verifier'); } catch { /* One-time cleanup best effort. */ }
  const headers = deps.native ? { 'X-Client': 'native' } : undefined;
  return deps.post<SessionBody>('/auth/handoff/redeem', { code, app, ...(verifier ? { verifier } : {}) }, headers);
}

/** Start an explicit PKCE pull request from the login screen to the already-signed-in app. */
export async function startPull(
  sourceApp: AppName,
  targetApp: AppName,
  configuredSourceUrl?: string,
  native?: { packageName: string; request: (packageName: string, scheme: string, challenge: string, returnScheme: string) => Promise<boolean> },
): Promise<void> {
  if (sourceApp === targetApp) return;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sourceUrl = native ? null : safeConfiguredUrl(configuredSourceUrl);
  if (!native && !sourceUrl) throw new Error('The other app address is not configured.');
  try {
    // The requesting app keeps the verifier while the other app answers the challenge.
    sessionStorage.setItem('nhc.handoff.verifier', verifier);
    if (native) {
      const launched = await native.request(native.packageName, `nhc-${sourceApp}`, challenge, `nhc-${targetApp}`);
      if (!launched) throw new Error('The other app could not be opened.');
      return;
    }
    window.location.assign(`${sourceUrl}/sso?target=${targetApp}&challenge=${challenge}`);
  } catch (error) {
    try { sessionStorage.removeItem('nhc.handoff.verifier'); } catch { /* Best-effort cleanup. */ }
    throw error;
  }
}
