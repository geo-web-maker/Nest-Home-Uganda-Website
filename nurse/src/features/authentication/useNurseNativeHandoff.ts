import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../../lib/api/client';
import { nurseDb } from '../../offline/db';
import { saveRefreshToken } from '../../platform/secureTokenStorage';
import { saveWebCredential } from '../../lib/api/webCredential';
import { redeem } from '../../platform/appSwitch';

type NativeHandoffOptions = {
  completeSignIn: () => Promise<void>;
  clearProfile: () => void;
  setLoginError: (message: string) => void;
  setMessage: (message: string) => void;
  setToken: (token: string) => void;
  setOfflineTrusted: (trusted: boolean) => void;
  signOutLocal: () => Promise<void>;
};

/** Handles the one-time cross-app handoff event without moving session policy out of its owners. */
export function useNurseNativeHandoff({
  completeSignIn,
  clearProfile,
  setLoginError,
  setMessage,
  setToken,
  setOfflineTrusted,
  signOutLocal,
}: NativeHandoffOptions) {
  /** One handoff at a time: the one-time code must never be redeemed twice. */
  const inFlight = useRef(false);

  const acceptNativeHandoff = useCallback(async (code: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const pending = (await nurseDb.outbox.count()) + (await nurseDb.photos.count());
      if (pending > 0) {
        setMessage('This device still has unsent nurse data. Sync or resolve those items before switching accounts.');
        return;
      }
      const native = Capacitor.isNativePlatform();
      let body: Awaited<ReturnType<typeof redeem>>;
      try {
        body = await redeem(code, 'nurse', {
          native,
          post: <T,>(path: string, payload: unknown, headers?: Record<string, string>) =>
            apiRequest<T>(path, { method: 'POST', body: JSON.stringify(payload), headers }),
        });
        // Check everything we need before writing anything, so a bad response leaves no partial state.
        if (!body.access_token || !body.user?.id) throw new Error('Incomplete handoff response');
        if (native && !body.refresh_token) throw new Error('Missing native refresh token');
        if (!native && !body.csrf_token) throw new Error('Missing web CSRF token');
      } catch {
        setMessage('We could not sign you in automatically. Please sign in.');
        return;
      }
      const previousUserId = localStorage.getItem('nest.nurse.cache-user-id');
      if (previousUserId && previousUserId !== body.user.id) {
        await signOutLocal();
        clearProfile();
      }
      try {
        if (native) {
          await saveRefreshToken(body.refresh_token as string);
        } else {
          sessionStorage.setItem('nurse_csrf_token', body.csrf_token as string);
          saveWebCredential(body.csrf_token as string);
        }
        sessionStorage.setItem('nurse_access_token', body.access_token);
        setToken(body.access_token);
        setOfflineTrusted(false);
        setLoginError('');
      } catch {
        sessionStorage.removeItem('nurse_access_token');
        sessionStorage.removeItem('nurse_csrf_token');
        setToken('');
        setMessage('We could not sign you in automatically. Please sign in.');
        return;
      }
      try {
        await completeSignIn();
      } catch {
        setMessage('You are signed in, but your data could not be loaded. Check your connection and try again.');
      }
    } finally {
      inFlight.current = false;
    }
  }, [completeSignIn, clearProfile, setLoginError, setMessage, setToken, setOfflineTrusted, signOutLocal]);

  useEffect(() => {
    const onNativeHandoff = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      if (detail?.code && /^[A-Za-z0-9_-]{20,100}$/.test(detail.code)) {
        void acceptNativeHandoff(detail.code);
      }
    };
    window.addEventListener('nhc:native-handoff', onNativeHandoff);
    return () => window.removeEventListener('nhc:native-handoff', onNativeHandoff);
  }, [acceptNativeHandoff]);
}
