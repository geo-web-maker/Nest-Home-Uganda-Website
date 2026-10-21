import { ApiError, apiClient, setAuthHooks, type ApiClient } from '../../../lib/api/client';
import type { TokenResponse } from '../../../types';
import { authStore } from './authStore';

let inFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new session (POST /auth/refresh).
 * Resolves true when the session was renewed. Calls made while one is running share it: the
 * server rotates the refresh token on every use, so a second parallel call would look like token
 * reuse and revoke the session.
 */
export function refreshSession(client: ApiClient = apiClient): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
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
      } else if (authStore.getState().status === 'loading') {
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
export async function restoreSession(client: ApiClient = apiClient): Promise<void> {
  await refreshSession(client);
}

export async function login(
  email: string,
  password: string,
  client: ApiClient = apiClient,
): Promise<void> {
  const session = await client.post<TokenResponse>(
    '/auth/login',
    { email, password },
    { retryOn401: false },
  );
  authStore.setSession(session);
}

/** Ends the session here even when the server cannot be reached. */
export async function logout(client: ApiClient = apiClient): Promise<void> {
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
