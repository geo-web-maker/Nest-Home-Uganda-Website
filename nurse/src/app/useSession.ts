import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../lib/api/client';
import { clearRefreshToken, saveRefreshToken } from '../platform/secureTokenStorage';
import { copy } from '../copy';

type SessionResponse = { access_token: string; refresh_token?: string; csrf_token?: string };
export type SessionCallbacks = {
  onAuthenticated?: (token: string) => Promise<void> | void;
  onMessage?: (message: string) => void;
  clearLocalSession?: () => Promise<void> | void;
};

/** Session mutation helpers; the caller owns profile hydration and logout warning UI. */
export function useSession(callbacks: SessionCallbacks = {}) {
  const [token, setToken] = useState(() => sessionStorage.getItem('nurse_access_token') ?? '');
  const signIn = useCallback(async (identifier: string, password: string) => {
    const path = Capacitor.isNativePlatform() ? '/auth/native/login' : '/auth/login';
    const body = await apiRequest<SessionResponse>(path, { method: 'POST', body: JSON.stringify({ email: identifier, password }) });
    sessionStorage.setItem('nurse_access_token', body.access_token);
    if (Capacitor.isNativePlatform() && body.refresh_token) await saveRefreshToken(body.refresh_token);
    if (!Capacitor.isNativePlatform() && body.csrf_token) sessionStorage.setItem('nurse_csrf_token', body.csrf_token);
    setToken(body.access_token);
    await callbacks.onAuthenticated?.(body.access_token);
    callbacks.onMessage?.(copy.messages.signedIn);
    return body.access_token;
  }, [callbacks]);
  const signOutLocal = useCallback(async () => {
    sessionStorage.removeItem('nurse_csrf_token');
    sessionStorage.removeItem('nurse_access_token');
    try { await clearRefreshToken(); } catch { /* Local sign-out must complete. */ }
    await callbacks.clearLocalSession?.();
    setToken('');
  }, [callbacks]);
  return { token, setToken, signIn, signOutLocal };
}
