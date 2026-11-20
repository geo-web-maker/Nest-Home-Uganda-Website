import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import styles from '../pwa/InstallHint.module.css';
import { NativeUpdater } from './nativeUpdater';

type Latest = { update: false } | { update: true; version: string; url: string; sha256?: string | null; release_notes?: string };
type Phase = { kind: 'idle' } | { kind: 'downloading'; pct: number } | { kind: 'installing' } | { kind: 'error'; message: string };

const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Offers a full APK update (for native changes). Website-only changes arrive silently as web bundles. */
export function ApkUpdateBanner() {
  const [latest, setLatest] = useState<(Latest & { update: true }) | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    void (async () => {
      try {
        const { versionName } = await NativeUpdater.getInfo();
        const response = await fetch(`${apiBase}/api/v1/app-bundles/admin/apk?current=${encodeURIComponent(versionName)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = (await response.json()) as Latest;
        if (!cancelled && body.update) setLatest(body);
      } catch { /* Offline or unreachable: no banner. */ }
    })();
    return () => { cancelled = true; };
  }, [native]);

  const install = useCallback(async () => {
    if (!latest) return;
    setPhase({ kind: 'downloading', pct: 0 });
    try {
      await NativeUpdater.downloadAndInstall(
        { url: latest.url, sha256: latest.sha256, fileName: `admin-${latest.version}.apk` },
        (event) => {
          if (event.type === 'progress') setPhase({ kind: 'downloading', pct: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0 });
          else setPhase({ kind: 'installing' });
        },
      );
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [latest]);

  if (!native || !latest) return null;
  return (
    <aside role="status" aria-label="App update available" className={styles.prompt}>
      <span>
        {phase.kind === 'downloading' ? `Downloading the update… ${phase.pct}%`
          : phase.kind === 'installing' ? 'Opening the installer…'
          : phase.kind === 'error' ? `Update failed: ${phase.message}`
          : `A new version of the admin app (${latest.version}) is ready to install.`}
      </span>
      <div className={styles.actions}>
        {(phase.kind === 'idle' || phase.kind === 'error') && <button type="button" onClick={() => void install()}>{phase.kind === 'error' ? 'Try again' : 'Update app'}</button>}
        {phase.kind === 'idle' && <button type="button" onClick={() => setLatest(null)}>Later</button>}
      </div>
    </aside>
  );
}
