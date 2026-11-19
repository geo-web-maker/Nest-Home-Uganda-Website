import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Same behaviour and wording as the admin app: nothing installs until the nurse taps "Update now". */
function WebUpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) { console.warn('[nurse-pwa] service worker registration failed', error); },
  });
  if (offlineReady) {
    return <aside role="status" aria-label="Offline readiness" className="pwa-prompt">
      <span>The nurse app is ready to work offline.</span>
      <div className="pwa-prompt__actions"><button type="button" className="pwa-prompt__ghost" onClick={() => setOfflineReady(false)}>Dismiss</button></div>
    </aside>;
  }
  if (!needRefresh) return null;
  return <aside role="status" aria-label="App update available" className="pwa-prompt">
    <span>A new version of the nurse app is available. Saved work stays on this phone.</span>
    <div className="pwa-prompt__actions">
      <button type="button" onClick={() => void updateServiceWorker(true)}>Update now</button>
      <button type="button" className="pwa-prompt__ghost" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  </aside>;
}

/** The installed Android app updates through its own download notice, so the web prompt is skipped there. */
export function UpdatePrompt() {
  if (Capacitor.isNativePlatform()) return null;
  return <WebUpdatePrompt />;
}
