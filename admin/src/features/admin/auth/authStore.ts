import type { UserPublic } from '@shared/types';

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

// A copy of the signed-in user (name, scopes) lets a cold start without a network open the app. It is not a
// credential: the access token is never stored, and the session is only trusted while a refresh credential
// still exists (the native refresh token, or the CSRF value that goes with the refresh cookie).
const USER_KEY = 'nhc.session-user';

function readUserSnapshot(): UserPublic | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserPublic) : null;
  } catch {
    return null;
  }
}

function writeUserSnapshot(user: UserPublic | null): void {
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    // Storage blocked: offline start is simply unavailable.
  }
}

let state: AuthState = { status: 'loading', accessToken: null, user: null };
const listeners = new Set<() => void>();
const clearedListeners = new Set<() => void>();

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
    writeUserSnapshot(session.user);
    set({ status: 'signedIn', accessToken: session.access_token, user: session.user });
  },
  /** The stored copy of the last signed-in user, if any. */
  getUserSnapshot: readUserSnapshot,
  /** Signed in without a live token (no network at start). Calls retry the refresh when the network returns. */
  setOfflineSession(user: UserPublic): void {
    set({ status: 'signedIn', accessToken: null, user });
  },
  /** Runs after an explicit sign-out or a refused refresh, so cached data can be wiped with the session. */
  onCleared(listener: () => void): () => void {
    clearedListeners.add(listener);
    return () => clearedListeners.delete(listener);
  },
  clearSession(): void {
    writeCsrf(null);
    writeUserSnapshot(null);
    clearedListeners.forEach((listener) => listener());
    set({ status: 'signedOut', accessToken: null, user: null });
  },
  /** Signed out for now, but the stored CSRF token is kept (a failed restore that may pass). */
  markSignedOut(): void {
    set({ status: 'signedOut', accessToken: null, user: null });
  },
  /** Back to the first-load state. Used by tests. */
  reset(): void {
    writeCsrf(null);
    writeUserSnapshot(null);
    set({ status: 'loading', accessToken: null, user: null });
  },
};
