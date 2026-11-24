import { useSyncExternalStore } from 'react';
import { API_PREFIX, ApiError, setNetworkObserver } from '@shared/lib/api/client';

/** offline = the device has no network; unreachable = it has one but the server does not answer. */
export type Connection = 'online' | 'offline' | 'unreachable';
let state: Connection = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online';
const listeners = new Set<() => void>();
function set(next: Connection): void { if (next !== state) { state = next; listeners.forEach((l) => l()); } }
export const getConnection = (): Connection => state;
export const subscribeConnection = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useConnection = (): Connection => useSyncExternalStore(subscribeConnection, getConnection, getConnection);

/** Quick check that the server answers. Updates the shared state and returns it. */
export async function pingServer(): Promise<Connection> {
  if (!navigator.onLine) { set('offline'); return state; }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4_000);
  try { await fetch(`${import.meta.env.VITE_API_URL ?? ''}${API_PREFIX}/health`, { signal: ctl.signal, cache: 'no-store' }); set('online'); }
  catch { set(navigator.onLine ? 'unreachable' : 'offline'); }
  finally { clearTimeout(timer); }
  return state;
}

export function installConnectionMonitor(): void {
  setNetworkObserver((ok) => { if (ok) set('online'); else if (!navigator.onLine) set('offline'); else void pingServer(); });
  window.addEventListener('offline', () => set('offline'));
  window.addEventListener('online', () => void pingServer());
  window.setInterval(() => { if (state !== 'online') void pingServer(); }, 20_000);
  void pingServer();
}

/** Plain-language text for a failed request. Real permission errors (403) keep the server's own message. */
export function friendlyError(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof ApiError && error.status === 0) {
    return state === 'offline' || !navigator.onLine ? "You're offline." : "Connected, but the server isn't responding.";
  }
  return error instanceof Error ? error.message : fallback;
}
