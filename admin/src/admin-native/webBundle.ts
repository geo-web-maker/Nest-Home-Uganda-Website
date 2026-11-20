import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Over-the-air web updates for the installed Android app. The same file lives in admin/src/admin-native/.
 * Flow: check the API -> native downloads, verifies and unpacks -> stage it for the next launch ->
 * reload into it after the app has been in the background a while. A launch that never calls confirm()
 * rolls back natively, and installing a new APK discards every downloaded bundle.
 */
declare const __BUNDLE_VERSION__: string;

interface WebBundleState { running: string; staged: string; bad: string; nativeCode: number }
interface WebBundlePlugin {
  current(): Promise<WebBundleState>;
  download(options: { url: string; sha256: string; version: string }): Promise<{ version: string }>;
  stage(options: { version: string }): Promise<void>;
  applyStaged(): Promise<void>;
  confirm(): Promise<void>;
}
export const WebBundle = registerPlugin<WebBundlePlugin>('WebBundle');

type BundleApp = 'nurse' | 'admin';
type LatestBundle = { update: false } | { update: true; version: string; url: string; sha256: string };

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const CONFIRM_AFTER_MS = 5_000;
const FIRST_CHECK_AFTER_MS = 10_000;
const CHECK_EVERY_MS = 30 * 60_000;
const RELOAD_AFTER_BACKGROUND_MS = 5 * 60_000;

/** Downloads and stages a newer bundle if the API offers one this APK can run. */
export async function stageWebBundleUpdate(app: BundleApp): Promise<'none' | 'staged'> {
  const state = await WebBundle.current();
  if (state.staged) return 'none'; // one is already waiting for the next launch
  const current = state.running || __BUNDLE_VERSION__;
  const url = `${apiBase}/api/v1/app-bundles/${app}/latest?native_code=${state.nativeCode}&current=${encodeURIComponent(current)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return 'none';
  const latest = (await response.json()) as LatestBundle;
  if (!latest.update || latest.version === state.bad || latest.version === state.running) return 'none';
  await WebBundle.download({ url: latest.url, sha256: latest.sha256, version: latest.version });
  await WebBundle.stage({ version: latest.version });
  return 'staged';
}

export function startWebBundleUpdates(app: BundleApp): void {
  if (!Capacitor.isNativePlatform()) return;
  window.setTimeout(() => { void WebBundle.confirm().catch(() => undefined); }, CONFIRM_AFTER_MS);

  let lastCheck = 0;
  let hiddenAt = 0;
  const check = async () => {
    if (!navigator.onLine || Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    try { await stageWebBundleUpdate(app); } catch { /* Offline or unreachable: keep the current bundle. */ }
  };
  window.setTimeout(() => { void check(); }, FIRST_CHECK_AFTER_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    void (async () => {
      // A long absence is as good as a cold start, so switch to a staged bundle now.
      if (away >= RELOAD_AFTER_BACKGROUND_MS) {
        try { if ((await WebBundle.current()).staged) { await WebBundle.applyStaged(); return; } } catch { /* ignore */ }
      }
      await check();
    })();
  });
}
