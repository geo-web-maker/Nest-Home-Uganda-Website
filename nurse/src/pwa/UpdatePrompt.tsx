import { Capacitor } from '@capacitor/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DismissButton } from '../ui/DismissButton';
import { Icon } from '../ui/Icon';
import { PillButton } from '../ui/PillButton';

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

/** The installed Android app updates through its own download notice, so the web prompt is skipped there. */
export function UpdatePrompt() {
  if (Capacitor.isNativePlatform()) return null;
  return <WebUpdatePrompt />;
}
