import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@shared/lib/api/client';
import { MAIL_CHANGED_EVENT } from './useMailUnread';

const SW_URL = '/sw.js';
const MANIFEST_URL = '/manifest.webmanifest';

const canPush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Makes the admin installable and ready for notifications: links the manifest, registers the worker, and
 * refreshes the unread badge when a push arrives. Mount once in the admin shell.
 */
export function useAdminPwa(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const added = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.href = MANIFEST_URL;
      document.head.appendChild(link);
    }
    if (canPush()) void navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => undefined);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'nest-mail-push') window.dispatchEvent(new Event(MAIL_CHANGED_EVENT));
    };
    if (canPush()) navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      if (added) link?.remove();
      if (canPush()) navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [enabled]);
}

export type MailPush = {
  /** True when this browser can do push and the server has notifications switched on. */
  available: boolean;
  subscribed: boolean;
  blocked: boolean;
  busy: boolean;
  error: string;
  toggle: () => Promise<void>;
};

export function useMailPush(enabled: boolean): MailPush {
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !canPush()) return;
    let alive = true;
    (async () => {
      try {
        const info = await apiClient.get<{ enabled: boolean; public_key: string | null }>('/mail/push/key');
        if (!alive || !info.enabled || !info.public_key) return;
        setServerKey(info.public_key);
        setBlocked(Notification.permission === 'denied');
        const registration = await navigator.serviceWorker.getRegistration('/');
        const existing = await registration?.pushManager.getSubscription();
        if (alive) setSubscribed(Boolean(existing) && Notification.permission === 'granted');
      } catch {
        /* notifications are optional; stay hidden */
      }
    })();
    return () => { alive = false; };
  }, [enabled]);

  const toggle = useCallback(async () => {
    if (!serverKey) return;
    setBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await apiClient.post('/mail/push/unsubscribe', { endpoint: existing.endpoint }).catch(() => undefined);
        await existing.unsubscribe();
        setSubscribed(false);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setBlocked(permission === 'denied');
        setError('Notifications were not allowed. Allow them in your browser or phone settings, then try again.');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(serverKey) as BufferSource,
      });
      await apiClient.post('/mail/push/subscribe', subscription.toJSON());
      setSubscribed(true);
    } catch {
      setError('Could not turn notifications on. On iPhone, install the app to your Home Screen first.');
    } finally {
      setBusy(false);
    }
  }, [serverKey]);

  return { available: Boolean(serverKey), subscribed, blocked, busy, error, toggle };
}
