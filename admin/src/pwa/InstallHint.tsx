import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './InstallHint.module.css';

/** Small, accessible update prompt; no update is installed without an explicit click. */
export function InstallHint() {
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
