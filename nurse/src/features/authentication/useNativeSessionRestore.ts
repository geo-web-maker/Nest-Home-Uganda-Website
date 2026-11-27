import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { restoreNativeSession } from '../../lib/api/client';
import { readCachedProfile, type FieldProfile } from '../../app/useFieldProfile';
import { nurseDb } from '../../offline/db';
import { readRefreshToken } from '../../platform/secureTokenStorage';
import { copy } from '../../copy';

type NativeSessionRestoreOptions = {
  offlineTrusted: boolean;
  setToken: (token: string) => void;
  setOfflineTrusted: (trusted: boolean) => void;
  applyProfile: (profile: FieldProfile) => Promise<void>;
  refreshLocal: () => Promise<void>;
  setMessage: (message: string) => void;
};

/** Restores the native cached account first, then upgrades it to a live session when possible. */
export function useNativeSessionRestore({
  offlineTrusted,
  setToken,
  setOfflineTrusted,
  applyProfile,
  refreshLocal,
  setMessage,
}: NativeSessionRestoreOptions) {
  const [bootChecked, setBootChecked] = useState(
    () => !Capacitor.isNativePlatform() || Boolean(sessionStorage.getItem('nurse_access_token')),
  );
  const restoringSession = useRef(false);

  const restoreLiveSession = useCallback(async (): Promise<boolean> => {
    if (restoringSession.current) return true;
    restoringSession.current = true;
    try {
      const restored = await restoreNativeSession();
      if (restored) {
        setToken(restored);
        setOfflineTrusted(false);
        setMessage(copy.messages.sessionRestored);
      } else {
        setOfflineTrusted(false);
      }
      return true;
    } catch {
      return false; // Offline: keep the cached account available and retry when connectivity returns.
    } finally {
      restoringSession.current = false;
    }
  }, [setOfflineTrusted, setToken, setMessage]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || sessionStorage.getItem('nurse_access_token')) return;
    let active = true;
    void (async () => {
      let owner: string | null = null;
      try {
        const refreshToken = await readRefreshToken();
        owner = localStorage.getItem('nest.nurse.cache-user-id');
        if (!active || !refreshToken) return;
        if (owner) {
          const cached = await readCachedProfile(owner);
          if (cached && active) {
            const accepted = new Set((await nurseDb.consents.toArray()).map((row) => `${row.type}:${row.version}`));
            await applyProfile({
              ...cached,
              consents_required: (cached.consents_required ?? []).filter((item) => !accepted.has(`${item.type}:${item.version}`)),
            });
            setOfflineTrusted(true);
            void refreshLocal();
          }
        }
      } catch {
        // An unreadable cache falls back to the normal sign-in screen.
      } finally {
        if (active) setBootChecked(true);
      }
      if (!active) return;
      const reached = await restoreLiveSession();
      if (active && !reached && !owner) setMessage(copy.messages.sessionRestoreFailed);
    })();
    return () => { active = false; };
  }, [applyProfile, refreshLocal, restoreLiveSession, setMessage, setOfflineTrusted]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !offlineTrusted) return;
    const attempt = () => {
      if (navigator.onLine && !sessionStorage.getItem('nurse_access_token')) void restoreLiveSession();
    };
    window.addEventListener('online', attempt);
    const timer = window.setInterval(attempt, 30_000);
    let handle: { remove: () => Promise<void> } | undefined;
    let active = true;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) attempt();
    }).then((listener) => {
      if (!active) void listener.remove();
      else handle = listener;
    }).catch(() => undefined);
    return () => {
      active = false;
      window.removeEventListener('online', attempt);
      window.clearInterval(timer);
      void handle?.remove();
    };
  }, [offlineTrusted, restoreLiveSession]);

  return { bootChecked };
}
