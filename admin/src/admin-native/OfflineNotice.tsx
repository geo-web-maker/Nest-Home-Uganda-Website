import { useSyncExternalStore } from 'react';
import { lastSavedAt, subscribeLastSaved } from './queryPersistence';
import { useConnection } from './connection';
import { subscribeWrites, writeCounts } from './writeQueue';

/** A thin bar for "offline" and "server unreachable", plus changes waiting to send. */
export function OfflineNotice() {
  const conn = useConnection();
  const savedAt = useSyncExternalStore(subscribeLastSaved, lastSavedAt, lastSavedAt);
  const counts = useSyncExternalStore(subscribeWrites, writeCounts, writeCounts);
  if (conn === 'online' && !counts.queued && !counts.failed) return null;
  const stamp = savedAt ? ` Showing data saved ${new Date(savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : '';
  const head = conn === 'offline' ? "You're offline." : conn === 'unreachable' ? "Connected, but the server isn't responding." : '';
  const queue = counts.queued ? ` ${counts.queued} change${counts.queued === 1 ? '' : 's'} will send when the connection returns.` : '';
  const failed = counts.failed ? ` ${counts.failed} saved change${counts.failed === 1 ? ' was' : 's were'} rejected by the server.` : '';
  return (
    <div role="status" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, padding: '0.5rem 1rem',
      paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', background: '#3a2f12', color: '#fff', fontSize: '0.85rem', textAlign: 'center' }}>
      {head}{conn === 'online' ? '' : stamp}{queue}{failed}
    </div>
  );
}
