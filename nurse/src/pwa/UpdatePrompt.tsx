import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DismissButton } from '../ui/DismissButton';
import { Icon } from '../ui/Icon';
import { PillButton } from '../ui/PillButton';
import { NativeUpdater } from '../plugins/NativeUpdater';
import { WebBundle } from '../platform/webBundle';

declare const __BUNDLE_VERSION__: string;

/** Same notice layout as every toast: icon, text, then a close button. Nothing installs until the nurse taps "Update now". */
function WebUpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) { console.warn('[nurse-pwa] service worker registration failed', error); },
  });
  if (offlineReady) {
    return <aside role="status" aria-label="Offline readiness" className="mk-banner mk-banner--info mk-banner--floating">
      <Icon name="check" size={17} /><span className="mk-banner__text">The nurse app is ready to work offline.</span>
      <DismissButton onClick={() => setOfflineReady(false)} />
    </aside>;
  }
  if (!needRefresh) return null;
  return <aside role="status" aria-label="App update available" className="mk-banner mk-banner--info mk-banner--floating">
    <Icon name="info" size={17} /><span className="mk-banner__text">A new version of the nurse app is available. Saved work stays on this phone.</span>
    <div className="mk-banner__actions">
      <PillButton type="button" tone="gold" size="sm" showArrow={false} onClick={() => void updateServiceWorker(true)}>Update now</PillButton>
      <DismissButton label="Remind me later" onClick={() => setNeedRefresh(false)} />
    </div>
  </aside>;
}

type Offer =
  | { kind: 'apk'; version: string; url: string; sha256?: string | null }
  | { kind: 'bundle'; version: string; url: string; sha256: string }
  | { kind: 'staged'; version: string };
type Phase = { kind: 'idle' } | { kind: 'working'; text: string } | { kind: 'error'; message: string };

const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const FIRST_LOOK_MS = 15_000;
const LOOK_AGAIN_MS = 10 * 60_000;

async function findOffer(): Promise<Offer | null> {
  const [{ versionName, versionCode }, state] = await Promise.all([NativeUpdater.getInfo(), WebBundle.current()]);
  const apk = await fetch(`${apiBase}/api/v1/app-bundles/nurse/apk?current=${encodeURIComponent(versionName)}`, { cache: 'no-store' });
  if (apk.ok) {
    const body = (await apk.json()) as { update: boolean; version?: string; url?: string; sha256?: string | null };
    if (body.update && body.version && body.url) return { kind: 'apk', version: body.version, url: body.url, sha256: body.sha256 };
  }
  // A bundle the app already downloaded in the background is waiting for the nurse to apply it.
  if (state.staged) return { kind: 'staged', version: state.staged };
  const current = state.running || __BUNDLE_VERSION__;
  const latest = await fetch(`${apiBase}/api/v1/app-bundles/nurse/latest?native_code=${versionCode}&current=${encodeURIComponent(current)}`, { cache: 'no-store' });
  if (!latest.ok) return null;
  const body = (await latest.json()) as { update: boolean; version?: string; url?: string; sha256?: string };
  if (body.update && body.version && body.url && body.sha256 && body.version !== state.bad && body.version !== state.running) {
    return { kind: 'bundle', version: body.version, url: body.url, sha256: body.sha256 };
  }
  return null;
}

/** Installed Android app: tells the nurse when an update exists and lets them choose when to apply it. */
function NativeUpdatePrompt() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [later, setLater] = useState(false);

  useEffect(() => {
    let stopped = false;
    let lastLook = 0;
    const look = async () => {
      if (!navigator.onLine || Date.now() - lastLook < LOOK_AGAIN_MS) return;
      lastLook = Date.now();
      try { const found = await findOffer(); if (!stopped) setOffer(found); } catch { /* Offline or unreachable: no notice. */ }
    };
    const first = window.setTimeout(() => { void look(); }, FIRST_LOOK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; window.clearTimeout(first); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const apply = useCallback(async () => {
    if (!offer) return;
    try {
      if (offer.kind === 'apk') {
        setPhase({ kind: 'working', text: 'Downloading the update… 0%' });
        await NativeUpdater.downloadAndInstall({ url: offer.url, sha256: offer.sha256, fileName: `nurse-${offer.version}.apk` }, (event) => {
          if (event.type === 'progress') setPhase({ kind: 'working', text: `Downloading the update… ${event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0}%` });
          else setPhase({ kind: 'working', text: 'Opening the installer…' });
        });
        return;
      }
      if (offer.kind === 'bundle') {
        setPhase({ kind: 'working', text: 'Downloading the update…' });
        await WebBundle.download({ url: offer.url, sha256: offer.sha256, version: offer.version });
        await WebBundle.stage({ version: offer.version });
      }
      setPhase({ kind: 'working', text: 'Restarting the app…' });
      await WebBundle.applyStaged();
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [offer]);

  if (!offer || later) return null;
  const busy = phase.kind === 'working';
  const text = phase.kind === 'working' ? phase.text
    : phase.kind === 'error' ? `Update failed: ${phase.message}`
    : offer.kind === 'apk' ? `A new version of the nurse app (${offer.version}) is ready to install.`
    : `An app update (${offer.version}) is ready. Saved work stays on this phone.`;
  return <aside role="status" aria-label="App update available" className="mk-banner mk-banner--info mk-banner--floating">
    <Icon name="info" size={17} /><span className="mk-banner__text">{text}</span>
    {!busy && <div className="mk-banner__actions">
      <PillButton type="button" tone="gold" size="sm" showArrow={false} onClick={() => void apply()}>{phase.kind === 'error' ? 'Try again' : offer.kind === 'apk' ? 'Update app' : 'Update now'}</PillButton>
      {phase.kind === 'idle' && <DismissButton label="Remind me later" onClick={() => setLater(true)} />}
    </div>}
  </aside>;
}

/** On the installed Android app the update comes from the update server; in a browser it comes from the service worker. */
export function UpdatePrompt() {
  if (Capacitor.isNativePlatform()) return <NativeUpdatePrompt />;
  return <WebUpdatePrompt />;
}
