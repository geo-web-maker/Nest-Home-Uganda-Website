import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';
import { initTheme } from '@shared/lib/theme';
import { installClientErrorCapture } from '@shared/lib/api/clientErrors';
import { createQueryClient } from '@shared/lib/queries/queryClient';
import { LegacyAdminRedirect } from './routing/LegacyAdminRedirect';
import { Component as AdminApp } from './features/admin/AdminApp';
import '@shared/lib/i18n';
import '@shared/design/tokens.css';
import '@shared/design/fonts.css';
import '@shared/design/global.css';
import '@shared/design/motion.css';
import { startWebBundleUpdates } from './admin-native/webBundle';
import { OfflineNotice } from './admin-native/OfflineNotice';
import { restoreQueryCache, startQueryPersistence } from './admin-native/queryPersistence';
import { installConnectionMonitor } from './admin-native/connection';
import { installWriteQueue } from './admin-native/writeQueue';
import { installUpgradeRequiredHandler } from './admin-native/upgradeRequired';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiClient } from '@shared/lib/api/client';
import { readHandoffFromLocation, redeem } from './admin-native/appSwitch';
import { isNativeAppSwitchAvailable, launchOtherApp, readNativeHandoffCode, readNativeHandoffRequest } from './admin-native/nativeAppSwitch';
import { ADMIN_NATIVE_APP_ID, NURSE_NATIVE_APP_ID } from './admin-native/identity';
import { applyHandoffSession, restoreSession } from './features/admin/auth/session';
import { authStore } from './features/admin/auth/authStore';

// Strip an incoming one-time fragment synchronously before session restoration, logs or route rendering.
const initialHandoff = readHandoffFromLocation();
initTheme();
installUpgradeRequiredHandler();
if (typeof window !== 'undefined') installClientErrorCapture();
// offlineFirst: a screen with saved data shows it at once, and one without fails fast instead of waiting forever.
// gcTime outlasts a working day so saved results are not dropped from memory while the app stays open.
const queryClient = createQueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', gcTime: 24 * 60 * 60 * 1000 },
    mutations: { networkMode: 'always' }, // writes go through apiClient, which saves allowed ones to the write queue when offline
  },
});

async function applyIncomingHandoff(nativeCode?: string | null): Promise<boolean> {
  if (!initialHandoff && !nativeCode) return false;
  if (initialHandoff && 'error' in initialHandoff) {
    sessionStorage.setItem('nhc.handoff.notice', 'You are not signed in to the other app. Sign in here.');
    return false;
  }
  try {
    const code = initialHandoff && 'code' in initialHandoff ? initialHandoff.code : nativeCode;
    if (!code) return false;
    const body = await redeem(code, 'admin', {
      native: Capacitor.isNativePlatform(),
      post: <T,>(path: string, payload: unknown, headers?: Record<string, string>) => apiClient.post<T>(path, payload, { retryOn401: false, headers }),
    });
    const previous = authStore.getUserSnapshot();
    const changedUser = Boolean(previous && previous.id !== body.user.id);
    if (changedUser) { authStore.clearSession(); queryClient.clear(); }
    await applyHandoffSession(body);
    sessionStorage.removeItem('nhc.handoff.notice');
    return changedUser;
  } catch {
    sessionStorage.setItem('nhc.handoff.notice', 'We could not sign you in automatically. Please sign in.');
    return false;
  }
}

async function answerNativePullRequest(url: string): Promise<void> {
  const request = readNativeHandoffRequest(url, 'admin');
  if (!request || !isNativeAppSwitchAvailable()) return;
  const packageName = request.returnApp === 'nurse' ? NURSE_NATIVE_APP_ID : ADMIN_NATIVE_APP_ID;
  try {
    await restoreSession();
    if (authStore.getState().status !== 'signedIn' || !authStore.getAccessToken()) throw new Error('No active admin-app session was available.');
    const access = await apiClient.get<{ automatic_sso?: { effective_enabled: boolean } }>('/auth/app-access');
    const issued = await apiClient.post<{ code: string }>('/auth/handoff', {
      source_app: 'admin', target_app: request.returnApp, challenge: request.challenge,
      mode: access.automatic_sso?.effective_enabled ? 'automatic' : 'manual',
    });
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(issued.code)) throw new Error('Invalid handoff response.');
    await launchOtherApp(packageName, `nhc-${request.returnApp}`, issued.code);
  } catch {
    try { await launchOtherApp(packageName, `nhc-${request.returnApp}`, ''); } catch { /* Caller can reopen the original app manually. */ }
  }
}

async function start(): Promise<void> {
  let nativeCode: string | null = null;
  let nativeRequest: string | null = null;
  if (Capacitor.isNativePlatform()) {
    try {
      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url) {
        nativeCode = readNativeHandoffCode(launch.url, 'admin');
        if (!nativeCode && readNativeHandoffRequest(launch.url, 'admin')) nativeRequest = launch.url;
      }
    } catch { /* A missing launch URL is normal. */ }
  }
  if (nativeRequest) await answerNativePullRequest(nativeRequest);
  const changedUser = await applyIncomingHandoff(nativeCode);
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (readNativeHandoffRequest(url, 'admin')) { void answerNativePullRequest(url); return; }
      const code = readNativeHandoffCode(url, 'admin');
      if (!code) return;
      void (async () => {
        try {
          const body = await redeem(code, 'admin', { native: true, post: <T,>(path: string, payload: unknown, headers?: Record<string, string>) => apiClient.post<T>(path, payload, { retryOn401: false, headers }) });
          const previous = authStore.getUserSnapshot();
          if (previous && previous.id !== body.user.id) { authStore.clearSession(); queryClient.clear(); }
          await applyHandoffSession(body);
          sessionStorage.removeItem('nhc.handoff.notice');
        } catch { sessionStorage.setItem('nhc.handoff.notice', 'We could not sign you in automatically. Please sign in.'); }
      })();
    }).catch(() => undefined);
  }
  if (!changedUser) await restoreQueryCache(queryClient);
  startQueryPersistence(queryClient);
  installConnectionMonitor();
  installWriteQueue(queryClient);
  render();
}

function render(): void {
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Compatibility route for old bookmarks, email links and push payloads. */}
            <Route path="admin/*" element={<LegacyAdminRedirect />} />
            <Route path="/*" element={<AdminApp />} />
          </Routes>
        </BrowserRouter>
        <OfflineNotice />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
}

void start();
startWebBundleUpdates('admin');
