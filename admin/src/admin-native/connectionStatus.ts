import { useSyncExternalStore } from 'react';
import { lastSavedAt, subscribeLastSaved } from './queryPersistence';
import { useConnection, type Connection } from './connection';
import { subscribeWrites, writeCounts } from './writeQueue';

/** ok = fully online; issue = online but something needs attention; offline = no network at all. */
export type StatusLevel = 'ok' | 'issue' | 'offline';

export type ConnectionStatus = {
  level: StatusLevel;
  conn: Connection;
  /** Short plain-language text, shared by the bar and the dot's popover. Empty when all is well. */
  message: string;
  /** Changes whenever the situation changes, so the bar can re-appear for a moment. */
  signature: string;
};

export function useConnectionStatus(): ConnectionStatus {
  const conn = useConnection();
  const savedAt = useSyncExternalStore(subscribeLastSaved, lastSavedAt, lastSavedAt);
  const counts = useSyncExternalStore(subscribeWrites, writeCounts, writeCounts);
  const level: StatusLevel = conn === 'offline' ? 'offline' : conn === 'unreachable' || counts.queued || counts.failed ? 'issue' : 'ok';
  const stamp = savedAt ? ` Showing data saved ${new Date(savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : '';
  const head = conn === 'offline' ? "You're offline." : conn === 'unreachable' ? "Connected, but the server isn't responding." : '';
  const queue = counts.queued ? ` ${counts.queued} change${counts.queued === 1 ? '' : 's'} will send when the connection returns.` : '';
  const failed = counts.failed ? ` ${counts.failed} saved change${counts.failed === 1 ? ' was' : 's were'} rejected by the server.` : '';
  const message = level === 'ok' ? '' : `${head}${conn === 'online' ? '' : stamp}${queue}${failed}`.trim();
  return { level, conn, message, signature: `${conn}|${counts.queued}|${counts.failed}` };
}
