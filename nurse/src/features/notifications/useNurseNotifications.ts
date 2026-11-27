import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../../lib/api/client';
import { registerForPush, type StopPushRegistration } from '../../platform/push';
import { enableVisitReminders, scheduleVisitReminders } from '../../platform/notify';
import type { CachedVisit } from '../../offline/db';
import { copy } from '../../copy';
import { safeNurseNotificationPath } from './safeNotificationPath';

export type NurseInboxItem = { id: string; title: string; body: string; created_at?: string };


type UseNurseNotificationsOptions = {
  currentUserId: string;
  token: string;
  visits: CachedVisit[];
  visitRemindersEnabled: boolean;
  setVisitRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  sync: () => Promise<void>;
  navigate: (path: string) => void;
  setMessage: (message: string) => void;
  setInbox: Dispatch<SetStateAction<NurseInboxItem[]>>;
  setInboxMessage: Dispatch<SetStateAction<string>>;
};

/** Owns push registration, reminder scheduling and the optional nurse inbox lifecycle. */
export function useNurseNotifications({
  currentUserId,
  token,
  visits,
  visitRemindersEnabled,
  setVisitRemindersEnabled,
  sync,
  navigate,
  setMessage,
  setInbox,
  setInboxMessage,
}: UseNurseNotificationsOptions) {
  const registration = useRef<StopPushRegistration | null>(null);

  const stopPushRegistration = useCallback(async () => {
    try {
      await registration.current?.();
    } finally {
      registration.current = null;
    }
  }, []);

  useEffect(() => () => { void registration.current?.(); }, []);

  const registerPushIfOptedIn = useCallback(async (userId = currentUserId) => {
    if (!Capacitor.isNativePlatform() || !sessionStorage.getItem('nurse_access_token') || !userId) return;
    const deviceKey = `nest.nurse.device-id:${userId}`;
    const legacyDeviceId = localStorage.getItem('nest.nurse.device-id');
    const deviceId = localStorage.getItem(deviceKey) ?? legacyDeviceId ?? globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(deviceKey, deviceId);
    if (legacyDeviceId) localStorage.removeItem('nest.nurse.device-id');
    try {
      try { await stopPushRegistration(); } catch {
        // A stale native listener must not prevent a new session from registering.
      }
      const stop = await registerForPush(async (pushToken) => {
        await apiRequest('/field/devices', {
          method: 'POST',
          body: JSON.stringify({ device_id: deviceId, platform: Capacitor.getPlatform(), push_token: pushToken }),
        });
      }, {
        onReceived: (notification) => {
          void sync();
          setMessage([notification.title, notification.body].filter(Boolean).join(': ') || copy.messages.notificationReceived);
        },
        onAction: (action) => {
          void sync();
          const target = safeNurseNotificationPath(action.notification.data?.deep_link);
          if (target) navigate(target);
          setMessage(target ? copy.messages.notificationOpened : copy.messages.notificationOpenedSyncing);
        },
      });
      registration.current = stop ?? null;
    } catch {
      setMessage(copy.messages.pushUnavailable);
    }
  }, [currentUserId, navigate, setMessage, stopPushRegistration, sync]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !token || !visitRemindersEnabled) return;
    void scheduleVisitReminders(visits).catch(() => setMessage(copy.messages.remindersRefreshFailed));
  }, [token, visitRemindersEnabled, visits, setMessage]);

  const enableReminders = useCallback(async () => {
    try {
      // Explicit opt-in is the permission boundary for local reminders and push registration.
      const enabled = await enableVisitReminders();
      setVisitRemindersEnabled(enabled);
      localStorage.setItem('nest.nurse.visit-reminders', String(enabled));
      if (enabled) await scheduleVisitReminders(visits);
      if (Capacitor.isNativePlatform() && enabled) await registerPushIfOptedIn();
      setMessage(enabled ? copy.messages.remindersEnabled : copy.messages.remindersNotEnabled);
    } catch {
      setMessage(copy.messages.notificationsUnavailable);
    }
  }, [registerPushIfOptedIn, setMessage, setVisitRemindersEnabled, visits]);

  const clearScheduledReminders = useCallback(async () => {
    await scheduleVisitReminders([]);
  }, []);

  const disableReminders = useCallback(async () => {
    setVisitRemindersEnabled(false);
    localStorage.setItem('nest.nurse.visit-reminders', 'false');
    try {
      await scheduleVisitReminders([]);
    } catch {
      // Turning the preference off must remain available even if native cleanup fails.
    }
    setMessage(copy.messages.remindersDisabled);
  }, [setMessage, setVisitRemindersEnabled]);

  const loadInbox = useCallback(async () => {
    if (import.meta.env.VITE_NURSE_INBOX_ENABLED !== 'true' || !navigator.onLine) return;
    try {
      const result = await apiRequest<{ items: NurseInboxItem[] }>('/field/inbox');
      setInbox(result.items ?? []);
      setInboxMessage('');
    } catch {
      setInboxMessage(copy.messages.inboxUnavailable);
    }
  }, [setInbox, setInboxMessage]);

  useEffect(() => {
    if (token && import.meta.env.VITE_NURSE_INBOX_ENABLED === 'true') void loadInbox();
  }, [token, loadInbox]);

  return { registerPushIfOptedIn, stopPushRegistration, enableReminders, disableReminders, clearScheduledReminders, loadInbox };
}
