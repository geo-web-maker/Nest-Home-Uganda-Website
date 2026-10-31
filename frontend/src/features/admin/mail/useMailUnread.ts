import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api/client';

/** Fired by the mail screens after they change what is unread, so the sidebar badge updates at once. */
export const MAIL_CHANGED_EVENT = 'nest:mail-changed';

/** Total unread messages across the person's mailboxes. Polls quietly; any failure just shows no badge. */
export function useMailUnread(enabled: boolean, intervalMs = 60_000): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = () => {
      apiClient
        .get<{ items: { unread_count: number }[] }>('/mail/mailboxes')
        .then((result) => {
          if (alive) setCount(result.items.reduce((sum, box) => sum + (box.unread_count || 0), 0));
        })
        .catch(() => {
          if (alive) setCount(0);
        });
    };
    load();
    const timer = window.setInterval(load, intervalMs);
    window.addEventListener(MAIL_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(MAIL_CHANGED_EVENT, load);
    };
  }, [enabled, intervalMs]);
  return count;
}
