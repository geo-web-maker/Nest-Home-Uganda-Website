import { Capacitor } from '@capacitor/core';
import { registerAdminPush } from '../../../admin-native/push';
import { apiClient } from '../../../lib/api/client';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { UserPublic } from '../../../types';
import { authStore } from './authStore';
import { installAuthHooks, login, logout, restoreSession } from './session';

type AuthValue = {
  status: 'loading' | 'signedIn' | 'signedOut';
  user: UserPublic | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Wrap the admin routes. Installs the token and refresh hooks, then restores the session once. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);

  // Layout effects run before any child's data fetching effect, so the first request has its token.
  useLayoutEffect(() => installAuthHooks(), []);
  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || state.status !== 'signedIn') return;
    let deviceId=window.localStorage.getItem('nhc.admin.device-id');
    if (!deviceId) { deviceId=crypto.randomUUID(); window.localStorage.setItem('nhc.admin.device-id',deviceId); }
    void registerAdminPush(async (pushToken) => {
      await apiClient.post('/admin/care/devices',{device_id:deviceId,platform:Capacitor.getPlatform(),push_token:pushToken});
    });
  }, [state.status]);

  const value = useMemo<AuthValue>(
    () => ({
      status: state.status,
      user: state.user,
      login: (e, p) => login(e, p),
      logout: () => logout(),
    }),
    [state.status, state.user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
