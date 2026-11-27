import './features/careforms/careforms.css';
import { initTheme } from './lib/theme';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installNurseClientErrorCapture } from './lib/clientErrors';
import { ClientErrorBoundary } from './components/ClientErrorBoundary';
import './styles.css';
import { startWebBundleUpdates } from './platform/webBundle';
import { Capacitor } from '@capacitor/core';
import { apiRequest, restoreNativeSession, restoreWebSession } from './lib/api/client';
import { saveRefreshToken, clearRefreshToken } from './platform/secureTokenStorage';
import { saveWebCredential, clearStoredWebCredential } from './lib/api/webCredential';
import { nurseDb } from './offline/db';
import { readHandoffFromLocation, redeem } from './platform/appSwitch';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativeAppSwitchAvailable, launchOtherApp, readNativeHandoffCode, readNativeHandoffRequest } from './platform/nativeAppSwitch';
import { ADMIN_NATIVE_APP_ID, NURSE_NATIVE_APP_ID } from './platform/identity';

// This read and history cleanup are deliberately synchronous, before session restore or React boot.
const initialHandoff = readHandoffFromLocation();
initTheme();
installNurseClientErrorCapture();

async function applyIncomingHandoff(nativeCode?: string | null): Promise<void> {
  if (!initialHandoff && !nativeCode) return;
  if (initialHandoff && 'error' in initialHandoff) {
    sessionStorage.setItem('nhc.handoff.notice', 'You are not signed in to the other app. Sign in here.');
    return;
  }
  try {
    const code = initialHandoff && 'code' in initialHandoff ? initialHandoff.code : nativeCode;
    if (!code) return;
    const previousUserId = localStorage.getItem('nest.nurse.cache-user-id');
    // Pending nurse work may follow the same account safely, but must never be overwritten by
    // another identity. Check the one-time code's owner without consuming it before redemption.
    if (previousUserId) {
      const pending = (await nurseDb.outbox.count()) + (await nurseDb.photos.count());
      if (pending > 0) {
        if (!sessionStorage.getItem('nurse_access_token')) {
          if (Capacitor.isNativePlatform()) await restoreNativeSession();
          else await restoreWebSession();
        }
        try {
          const ownership = await apiRequest<{ same_user: boolean }>('/auth/handoff/check', {
            method: 'POST', body: JSON.stringify({ code, app: 'nurse' }),
          });
          if (!ownership.same_user) {
            sessionStorage.setItem('nhc.handoff.notice', 'We kept this account signed in because the other app belongs to a different user and this account still has unsent nurse data. Sync the records and photos before switching accounts.');
            return;
          }
        } catch {
          sessionStorage.setItem('nhc.handoff.notice', 'We kept this account signed in because we could not verify who owns the sign-in request. Connect to the internet and retry after checking your pending nurse data.');
          return;
        }
      }
    }
    const body = await redeem(code, 'nurse', {
      native: Capacitor.isNativePlatform(),
      post: <T,>(path: string, payload: unknown, headers?: Record<string, string>) => apiRequest<T>(path, {
        method: 'POST', body: JSON.stringify(payload), headers,
      }),
    });
    if (!body.access_token || !body.user?.id) throw new Error('The sign-in response was incomplete.');
    if (previousUserId && previousUserId !== body.user.id) {
      sessionStorage.removeItem('nurse_access_token');
      sessionStorage.removeItem('nurse_csrf_token');
      clearStoredWebCredential();
      await clearRefreshToken();
    }
    sessionStorage.setItem('nurse_access_token', body.access_token);
    if (Capacitor.isNativePlatform()) {
      if (!body.refresh_token) throw new Error('The native sign-in response did not contain a refresh token.');
      await saveRefreshToken(body.refresh_token);
    } else {
      if (!body.csrf_token) throw new Error('The web sign-in response did not contain a CSRF token.');
      sessionStorage.setItem('nurse_csrf_token', body.csrf_token);
      saveWebCredential(body.csrf_token);
    }
    sessionStorage.removeItem('nhc.handoff.notice');
  } catch {
    sessionStorage.setItem('nhc.handoff.notice', 'We could not sign you in automatically. Please sign in.');
  }
}

async function answerNativePullRequest(url: string): Promise<void> {
  const request = readNativeHandoffRequest(url, 'nurse');
  if (!request || !isNativeAppSwitchAvailable()) return;
  const packageName = request.returnApp === 'admin' ? ADMIN_NATIVE_APP_ID : NURSE_NATIVE_APP_ID;
  try {
    const restored = await restoreNativeSession();
    if (!restored) throw new Error('No active nurse-app session was available.');
    const access = await apiRequest<{ automatic_sso?: { effective_enabled: boolean } }>('/auth/app-access');
    const issued = await apiRequest<{ code: string }>('/auth/handoff', {
      method: 'POST',
      body: JSON.stringify({ source_app: 'nurse', target_app: request.returnApp, challenge: request.challenge, mode: access.automatic_sso?.effective_enabled ? 'automatic' : 'manual' }),
    });
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(issued.code)) throw new Error('Invalid handoff response.');
    await launchOtherApp(packageName, `nhc-${request.returnApp}`, issued.code);
  } catch {
    // Returning without a code brings the requesting app back to its login screen; never create
    // a session from a request when this app has no authenticated user or target capability.
    try { await launchOtherApp(packageName, `nhc-${request.returnApp}`, ''); } catch { /* The caller can reopen the original app manually. */ }
  }
}

async function start(): Promise<void> {
  let nativeCode: string | null = null;
  let nativeRequest: string | null = null;
  if (Capacitor.isNativePlatform()) {
    try {
      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url) {
        nativeCode = readNativeHandoffCode(launch.url, 'nurse');
        if (!nativeCode && readNativeHandoffRequest(launch.url, 'nurse')) nativeRequest = launch.url;
      }
    } catch { /* A missing launch URL is normal. */ }
  }
  if (nativeRequest) await answerNativePullRequest(nativeRequest);
  await applyIncomingHandoff(nativeCode);
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (readNativeHandoffRequest(url, 'nurse')) { void answerNativePullRequest(url); return; }
      const code = readNativeHandoffCode(url, 'nurse');
      if (code) window.dispatchEvent(new CustomEvent('nhc:native-handoff', { detail: { code } }));
    }).catch(() => undefined);
  }
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode><ClientErrorBoundary><App /></ClientErrorBoundary></React.StrictMode>,
  );
  startWebBundleUpdates('nurse');
}
void start();
