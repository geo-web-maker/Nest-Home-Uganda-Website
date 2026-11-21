import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Headless logic for the in-app "App Center" (the small store inside the app).
 * The same file lives in nurse/src/platform/ and admin/src/admin-native/ — keep the two identical.
 *
 * It answers four questions for the person using the app:
 *  1. Which build is this?             (native APK, installed PWA, or plain browser)
 *  2. Is a newer APK available?        GET /api/v1/app-bundles/{app}/apk?current=<versionName>
 *  3. Is a newer web bundle available? GET /api/v1/app-bundles/{app}/latest?native_code=&current=
 *  4. Is the PWA out of date?          service-worker update check, plus the newest web version number
 *                                      GET /api/v1/app-bundles/{app}/version?platform=web (browser / installed web app)
 */
declare const __BUNDLE_VERSION__: string;

export type AppKind = 'nurse' | 'admin';
export type Channel = 'native' | 'pwa' | 'browser';

export type ApkOffer = { version: string; url: string; sha256?: string | null; size_bytes?: number | null; release_notes?: string; version_code?: number | null };
export type BundleOffer = { version: string; url: string; sha256: string; size_bytes?: number | null; release_notes?: string };

export type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; what: 'apk' | 'bundle'; pct: number }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

export type Installed = { channel: Channel; webVersion: string; nativeVersion: string | null; nativeCode: number | null; runningBundle: string | null; stagedBundle: string | null };
export type PwaStatus = { supported: boolean; registered: boolean; updateReady: boolean };

type NativeUpdaterApi = {
  getInfo(): Promise<{ versionName: string; versionCode: number }>;
  downloadAndInstall(
    options: { url: string; sha256?: string | null; fileName: string },
    callback: (event: { type: 'progress'; loaded: number; total: number } | { type: 'done' }, err?: unknown) => void,
  ): Promise<string>;
};
type WebBundleApi = {
  current(): Promise<{ running: string; staged: string; bad: string; nativeCode: number }>;
  download(options: { url: string; sha256: string; version: string }): Promise<{ version: string }>;
  stage(options: { version: string }): Promise<void>;
  applyStaged(): Promise<void>;
};
export type AppCenterPlugins = { nativeUpdater: NativeUpdaterApi; webBundle: WebBundleApi };

const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const MIN_VERSION = '0.0.0';

export function detectChannel(): Channel {
  if (Capacitor.isNativePlatform()) return 'native';
  const standalone = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone ? 'pwa' : 'browser';
}

/** True when version `a` is higher than `b` (plain a.b.c numbers; anything unreadable counts as not newer). */
export function isNewerVersion(a: string | null | undefined, b: string | null | undefined): boolean {
  const parse = (v: string) => v.split('.').map((n) => Number(n));
  if (!a || !b) return false;
  const [x, y] = [parse(a), parse(b)];
  if ([...x, ...y].some((n) => !Number.isInteger(n))) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}/api/v1${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`The update service answered ${response.status}.`);
  return (await response.json()) as T;
}

async function pwaStatus(check: boolean): Promise<PwaStatus> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { supported: false, registered: false, updateReady: false };
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return { supported: true, registered: false, updateReady: false };
  if (check) {
    try { await registration.update(); } catch { /* Offline: report what is already known. */ }
    // A new worker installs in the background; give it a moment to reach "waiting".
    for (let i = 0; i < 12 && !registration.waiting && registration.installing; i += 1) await new Promise((r) => setTimeout(r, 500));
  }
  return { supported: true, registered: true, updateReady: Boolean(registration.waiting) };
}

export async function applyPwaUpdate(): Promise<boolean> {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration?.waiting) return false;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export function useAppCenter(app: AppKind, plugins: AppCenterPlugins) {
  const channel = detectChannel();
  const [installed, setInstalled] = useState<Installed>({ channel, webVersion: __BUNDLE_VERSION__, nativeVersion: null, nativeCode: null, runningBundle: null, stagedBundle: null });
  const [apk, setApk] = useState<ApkOffer | null>(null);
  const [apkIsNewer, setApkIsNewer] = useState(false);
  const [bundle, setBundle] = useState<BundleOffer | null>(null);
  const [webLatest, setWebLatest] = useState<string | null>(null);
  const [pwa, setPwa] = useState<PwaStatus>({ supported: false, registered: false, updateReady: false });
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPhase({ kind: 'checking' });
    try {
      const next: Installed = { channel, webVersion: __BUNDLE_VERSION__, nativeVersion: null, nativeCode: null, runningBundle: null, stagedBundle: null };
      if (channel === 'native') {
        const info = await plugins.nativeUpdater.getInfo();
        next.nativeVersion = info.versionName;
        next.nativeCode = info.versionCode;
        const state = await plugins.webBundle.current().catch(() => null);
        if (state) { next.runningBundle = state.running || __BUNDLE_VERSION__; next.stagedBundle = state.staged || null; }
        const current = next.runningBundle ?? __BUNDLE_VERSION__;
        const [apkAnswer, bundleAnswer] = await Promise.all([
          getJson<{ update: boolean } & Partial<ApkOffer>>(`/app-bundles/${app}/apk?current=${encodeURIComponent(info.versionName)}`),
          getJson<{ update: boolean } & Partial<BundleOffer>>(`/app-bundles/${app}/latest?native_code=${info.versionCode}&current=${encodeURIComponent(current)}`),
        ]);
        setApk(apkAnswer.update ? (apkAnswer as ApkOffer) : null);
        setApkIsNewer(Boolean(apkAnswer.update));
        const offered = bundleAnswer.update && bundleAnswer.version !== state?.bad && bundleAnswer.version !== next.stagedBundle ? (bundleAnswer as BundleOffer) : null;
        setBundle(offered);
        setWebLatest(null);
        setPwa({ supported: false, registered: false, updateReady: false });
      } else {
        // Browser or installed PWA: the APK is offered as a download for Android phones; the PWA updates through its service worker.
        const [apkAnswer, status, webAnswer] = await Promise.all([
          getJson<{ update: boolean } & Partial<ApkOffer>>(`/app-bundles/${app}/apk?current=${MIN_VERSION}`).catch(() => ({ update: false } as const)),
          pwaStatus(true),
          getJson<{ latest: string | null }>(`/app-bundles/${app}/version?platform=web&current=${encodeURIComponent(__BUNDLE_VERSION__)}`).catch(() => ({ latest: null })),
        ]);
        setWebLatest(webAnswer.latest ?? null);
        setApk(apkAnswer.update ? (apkAnswer as ApkOffer) : null);
        setApkIsNewer(false);
        setBundle(null);
        setPwa(status);
      }
      setInstalled(next);
      setCheckedAt(new Date());
      setPhase({ kind: 'idle' });
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error && error.message ? error.message : 'Could not reach the update service. Check your connection and try again.' });
    } finally {
      running.current = false;
    }
  }, [app, channel, plugins]);

  useEffect(() => { void check(); }, [check]);

  const installApk = useCallback(async () => {
    if (!apk) return;
    setPhase({ kind: 'downloading', what: 'apk', pct: 0 });
    try {
      await plugins.nativeUpdater.downloadAndInstall(
        { url: apk.url, sha256: apk.sha256, fileName: `${app}-${apk.version}.apk` },
        (event) => {
          if (event.type === 'progress') setPhase({ kind: 'downloading', what: 'apk', pct: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0 });
          else setPhase({ kind: 'installing' });
        },
      );
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [apk, app, plugins]);

  const installBundle = useCallback(async () => {
    if (!bundle) return;
    setPhase({ kind: 'downloading', what: 'bundle', pct: 0 });
    try {
      await plugins.webBundle.download({ url: bundle.url, sha256: bundle.sha256, version: bundle.version });
      await plugins.webBundle.stage({ version: bundle.version });
      setPhase({ kind: 'installing' });
      await plugins.webBundle.applyStaged(); // reloads into the new bundle
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [bundle, plugins]);

  const updatePwa = useCallback(async () => {
    setPhase({ kind: 'installing' });
    if (!(await applyPwaUpdate())) setPhase({ kind: 'idle' });
  }, []);

  return { channel, installed, apk, apkIsNewer, bundle, webLatest, pwa, phase, checkedAt, check, installApk, installBundle, updatePwa };
}
