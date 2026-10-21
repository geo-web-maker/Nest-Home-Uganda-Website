import type { UserPublic } from '../../../types';

export type AuthState = {
  /** `loading` until the first session restore has finished. */
  status: 'loading' | 'signedIn' | 'signedOut';
  accessToken: string | null;
  /** Includes `scopes` and `is_superadmin`. Held in memory only. */
  user: UserPublic | null;
};

// The CSRF token is the one value kept in browser storage. The API's CSRF cookie is HttpOnly and
// limited to /api/v1/auth, so the page cannot read it; the copy returned in the login and refresh
// body is what the X-CSRF-Token header is made from (BUILD_LOG S2 deviation 3). Without storing it,
// a page reload could not restore the session. It is not a credential on its own: refresh also
// needs the HttpOnly refresh cookie. The access token and the user never touch storage.
const CSRF_KEY = 'nhc.csrf';

function readCsrf(): string | null {
  try {
    return window.localStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

function writeCsrf(value: string | null): void {
  try {
    if (value) window.localStorage.setItem(CSRF_KEY, value);
    else window.localStorage.removeItem(CSRF_KEY);
  } catch {
    // Storage blocked: the session works until the next reload.
  }
}

let state: AuthState = { status: 'loading', accessToken: null, user: null };
const listeners = new Set<() => void>();

function set(next: AuthState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

type Session = { access_token: string; csrf_token: string; user: UserPublic };

export const authStore = {
  getState: (): AuthState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getAccessToken: (): string | null => state.accessToken,
  /** Read at call time, so a refresh made in another tab is picked up. */
  getCsrf: readCsrf,
  setSession(session: Session): void {
    writeCsrf(session.csrf_token);
    set({ status: 'signedIn', accessToken: session.access_token, user: session.user });
  },
  clearSession(): void {
    writeCsrf(null);
    set({ status: 'signedOut', accessToken: null, user: null });
  },
  /** Signed out for now, but the stored CSRF token is kept (a failed restore that may pass). */
  markSignedOut(): void {
    set({ status: 'signedOut', accessToken: null, user: null });
  },
  /** Back to the first-load state. Used by tests. */
  reset(): void {
    writeCsrf(null);
    set({ status: 'loading', accessToken: null, user: null });
  },
};
