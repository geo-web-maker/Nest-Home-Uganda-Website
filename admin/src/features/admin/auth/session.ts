import { Capacitor } from '@capacitor/core';
import {
  clearNativeRefreshToken,
  readNativeRefreshToken,
  saveNativeRefreshToken,
} from '../../../admin-native/secureTokenStorage';
import { ApiError, apiClient, setAuthHooks, type ApiClient } from '@shared/lib/api/client';
import type { TokenResponse } from '@shared/types';
import { authStore } from './authStore';

let inFlight: Promise<boolean> | null = null;

/**
 * Opens the app on the stored user when the first restore could not reach the server. Only while a refresh
 * credential is still on the device; a refusal from the server (401/403) never gets here.
 */
async function trustStoredSession(): Promise<boolean> {
  const user = authStore.getUserSnapshot();
  if (!user || authStore.getState().status !== 'loading') return false;
  const hasCredential = Capacitor.isNativePlatform()
    ? Boolean(await readNativeRefreshToken())
    : Boolean(authStore.getCsrf());
  if (!hasCredential || authStore.getState().status !== 'loading') return false;
  authStore.setOfflineSession(user);
  return true;
}

/** While running without a live token, try to get one whenever the network may be back. */
export function installOfflineRecovery(): () => void {
  const attempt = () => {
    const { status, accessToken } = authStore.getState();
    if (status === 'signedIn' && !accessToken && navigator.onLine) void refreshSession();
  };
  window.addEventListener('online', attempt);
  const timer = window.setInterval(attempt, 30_000);
  return () => {
    window.removeEventListener('online', attempt);
    window.clearInterval(timer);
  };
}

/**
 * Thrown by `login` when the password was a staff-issued temporary one. No session exists yet:
 * the caller sends the user to the set-password screen with this one-time token.
 */
export class PasswordChangeRequiredError extends Error {
  constructor(
    readonly token: string,
    readonly purpose: 'invite' | 'reset',
  ) {
    super('password_change_required');
  }
}

type PasswordChangeRequired = {
  password_change_required: true;
  set_password_token: string;
  purpose: 'invite' | 'reset';
};

function isPasswordChange(body: unknown): body is PasswordChangeRequired {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { password_change_required?: unknown }).password_change_required === true
  );
}
type NativeSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: TokenResponse['user'];
};

/**
 * Exchanges the refresh cookie for a new session (POST /auth/refresh).
 * Resolves true when the session was renewed. Calls made while one is running share it: the
 * server rotates the refresh token on every use, so a second parallel call would look like token
 * reuse and revoke the session.
 */
export function refreshSession(client: ApiClient = apiClient): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (Capacitor.isNativePlatform()) {
      const refreshToken = await readNativeRefreshToken();
      if (!refreshToken) {
        authStore.clearSession();
        return false;
      }
      try {
        const session = await client.post<NativeSession>(
          '/auth/native/refresh',
          { refresh_token: refreshToken },
          { retryOn401: false, headers: { 'X-Client': 'native' } },
        );
        await saveNativeRefreshToken(session.refresh_token);
        authStore.setSession({
          access_token: session.access_token,
          csrf_token: '',
          user: session.user,
        });
        return true;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearNativeRefreshToken();
          authStore.clearSession();
        } else if (!(await trustStoredSession()) && authStore.getState().status === 'loading') {
          authStore.markSignedOut();
        }
        return false;
      }
    }
    const csrf = authStore.getCsrf();
    if (!csrf) {
      authStore.clearSession();
      return false;
    }
    try {
      const session = await client.post<TokenResponse>('/auth/refresh', undefined, {
        retryOn401: false,
        headers: { 'X-CSRF-Token': csrf },
      });
      authStore.setSession(session);
      return true;
    } catch (error) {
      // Only a refusal ends the session. A network or server failure may pass: a signed-in user
      // stays signed in, and a first load settles on the login screen without losing the token.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        authStore.clearSession();
      } else if (!(await trustStoredSession()) && authStore.getState().status === 'loading') {
        authStore.markSignedOut();
      }
      return false;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** First load: renew the session from the refresh cookie, or settle on signed out. */
const RESTORE_TIMEOUT_MS = 8000;

export async function restoreSession(client: ApiClient = apiClient): Promise<void> {
  // If the restore never answers (a stuck native call, a sleeping server), show the sign-in screen instead of
  // leaving the app waiting forever. A restore that finishes later still signs the user in.
  // No network at all: do not make the user wait for a request that cannot succeed.
  if (!navigator.onLine && (await trustStoredSession())) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      void trustStoredSession().then((trusted) => {
        if (!trusted && authStore.getState().status === 'loading') authStore.markSignedOut();
        resolve();
      });
    }, RESTORE_TIMEOUT_MS);
  });
  try {
    await Promise.race([refreshSession(client), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function login(
  email: string,
  password: string,
  client: ApiClient = apiClient,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const session = await client.post<NativeSession | PasswordChangeRequired>(
      '/auth/native/login',
      { email, password },
      { retryOn401: false, headers: { 'X-Client': 'native' } },
    );
    if (isPasswordChange(session))
      throw new PasswordChangeRequiredError(session.set_password_token, session.purpose);
    await saveNativeRefreshToken(session.refresh_token);
    authStore.setSession({
      access_token: session.access_token,
      csrf_token: '',
      user: session.user,
    });
    return;
  }
  const session = await client.post<TokenResponse | PasswordChangeRequired>(
    '/auth/login',
    { email, password },
    { retryOn401: false },
  );
  if (isPasswordChange(session))
    throw new PasswordChangeRequiredError(session.set_password_token, session.purpose);
  authStore.setSession(session);
}

/** Ends the session here even when the server cannot be reached. */
export async function logout(client: ApiClient = apiClient): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const refreshToken = await readNativeRefreshToken();
    authStore.clearSession();
    await clearNativeRefreshToken();
    if (refreshToken) {
      try {
        await client.post(
          '/auth/native/logout',
          { refresh_token: refreshToken },
          { retryOn401: false, headers: { 'X-Client': 'native' } },
        );
      } catch {
        /* Local sign-out still completes. */
      }
    }
    return;
  }
  const csrf = authStore.getCsrf();
  authStore.clearSession();
  if (!csrf) return;
  try {
    await client.post('/auth/logout', undefined, {
      retryOn401: false,
      headers: { 'X-CSRF-Token': csrf },
    });
  } catch {
    // The refresh cookie then expires on its own; nothing more the page can do.
  }
}

/** Points the shared API client at this store (token) and at `refreshSession` (after a 401). */
export function installAuthHooks(): () => void {
  setAuthHooks({
    getAccessToken: authStore.getAccessToken,
    onUnauthorized: () => refreshSession(),
  });
  return () => setAuthHooks({});
}
