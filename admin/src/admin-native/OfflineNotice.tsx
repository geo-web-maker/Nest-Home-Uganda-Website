import { useEffect, useState } from 'react';
import { useConnectionStatus } from './connectionStatus';

const SHOW_MS = 6_000;

/**
 * A thin bar at the bottom for "offline", "server unreachable" and changes waiting to send.
 * It stays for a few seconds whenever the situation changes, then slides away and leaves the
 * status dot (ConnectionDot, next to the profile circle) to carry the state.
 */
export function OfflineNotice() {
  const { level, message, signature } = useConnectionStatus();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [signature]);
  if (level === 'ok') return null;
  return (
    <div role="status" aria-hidden={!visible} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, padding: '0.5rem 1rem',
      paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', background: level === 'offline' ? '#4a1d1d' : '#3a2f12', color: '#fff',
      fontSize: '0.85rem', textAlign: 'center', transition: 'transform .3s ease, opacity .3s ease',
      transform: visible ? 'translateY(0)' : 'translateY(100%)', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}>
      {message}
    </div>
  );
}
