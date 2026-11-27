import { useEffect, useState } from 'react';
import { apiClient } from '@shared/lib/api/client';

/** Fired by the SOS screens after a case changes, so the nav badge updates at once. */
export const SOS_CHANGED_EVENT = 'nest:sos-changed';
const POLL_MS = 30_000;
type SosRow = { test?: boolean; status?: unknown } | null | undefined;
const CLOSED = ['resolved', 'closed', 'cancelled'];

/** Number of SOS cases that are still open. Any failure just shows no badge. */
export function useOpenSosCount(enabled: boolean, intervalMs = POLL_MS): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let alive = true;
    const load = () => {
      apiClient
        .get<SosRow[] | { items?: SosRow[] }>('/admin/care/sos')
        .then((result) => {
          const items: SosRow[] = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
          const open = items.filter((row) => !row?.test && !CLOSED.includes(String(row?.status ?? '').toLowerCase())).length;
          if (alive) setCount(open);
        })
        .catch(() => { if (alive) setCount(0); });
    };
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    load();
    const timer = window.setInterval(tick, intervalMs);
    window.addEventListener(SOS_CHANGED_EVENT, load);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(SOS_CHANGED_EVENT, load);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, intervalMs]);
  return count;
}
