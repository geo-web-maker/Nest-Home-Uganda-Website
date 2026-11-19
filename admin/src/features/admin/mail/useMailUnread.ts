import { useEffect, useState } from 'react';
import { apiClient } from '@shared/lib/api/client';

/** Fired by the mail screens after they change what is unread, so the sidebar badge updates at once. */
export const MAIL_CHANGED_EVENT = 'nest:mail-changed';

/** How often a visible tab re-reads the badge. The server answers `/mail/unread` from MongoDB, so
 * this never touches the Neon compute and can be frequent. Hidden tabs skip it. */
export const MAIL_UNREAD_POLL_MS = 60_000;
/** Returning to the tab refreshes the badge, but not more often than this. */
export const MAIL_UNREAD_FOCUS_GAP_MS = 30_000;

/** Total unread messages across the person's mailboxes, from the Mongo-backed counter. Any failure just shows no badge. */
export function useMailUnread(enabled: boolean, intervalMs = MAIL_UNREAD_POLL_MS): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    let lastLoad = 0;
    const load = () => {
      lastLoad = Date.now();
      apiClient
        .get<{ unread: number }>('/mail/unread')
        .then((result) => {
          if (alive) setCount(Math.max(0, Number(result.unread) || 0));
        })
        .catch(() => {
          if (alive) setCount(0);
        });
    };
    const visible = () => document.visibilityState === 'visible';
    // Hidden tabs never poll; the next time the tab is shown the badge catches up.
    const tick = () => {
      if (visible()) load();
    };
    const onShown = () => {
      if (visible() && Date.now() - lastLoad >= MAIL_UNREAD_FOCUS_GAP_MS) load();
    };
    load();
    const timer = window.setInterval(tick, intervalMs);
    window.addEventListener(MAIL_CHANGED_EVENT, load);
    document.addEventListener('visibilitychange', onShown);
    window.addEventListener('focus', onShown);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(MAIL_CHANGED_EVENT, load);
      document.removeEventListener('visibilitychange', onShown);
      window.removeEventListener('focus', onShown);
    };
  }, [enabled, intervalMs]);
  return count;
}
