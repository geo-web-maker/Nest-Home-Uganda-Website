import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './InstallHint.module.css';

function WebInstallHint() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) { console.warn('[admin-pwa] service worker registration failed', error); },
  });

  if (offlineReady) {
    return (
      <aside role="status" aria-label="Offline readiness" className={styles.prompt}>
        <span>Admin is ready to work offline.</span>
        <div className={styles.actions}><button type="button" onClick={() => setOfflineReady(false)}>Dismiss</button></div>
      </aside>
    );
  }
  if (!needRefresh) return null;
  return (
    <aside role="status" aria-label="App update available" className={styles.prompt}>
      <span>A new version of the admin app is available.</span>
      <div className={styles.actions}>
        <button type="button" onClick={() => void updateServiceWorker(true)}>Update now</button>
        <button type="button" onClick={() => setNeedRefresh(false)}>Later</button>
      </div>
    </aside>
  );
}

/** The Android app updates through web bundles; a service worker there would shadow them, so it is skipped. */
export function InstallHint() {
  if (Capacitor.isNativePlatform()) return null;
  return <WebInstallHint />;
}
