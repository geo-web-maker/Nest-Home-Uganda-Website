import { useEffect, useSyncExternalStore, useState } from 'react';
import { lastSavedAt, subscribeLastSaved } from './queryPersistence';

/** A thin bar shown while the device is offline: the screens show saved data and changes need a connection. */
export function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const savedAt = useSyncExternalStore(subscribeLastSaved, lastSavedAt, lastSavedAt);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  const stamp = savedAt ? ` Showing data saved ${new Date(savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : '';
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, padding: '0.5rem 1rem',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', background: '#3a2f12', color: '#fff',
        fontSize: '0.85rem', textAlign: 'center',
      }}
    >
      You are offline.{stamp} Changes need a connection.
    </div>
  );
}
