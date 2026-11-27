import { useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Notice } from '@shared/components/dialogs/Notice';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from './auth/useAuth';
import { hasScopes } from './auth/hasScopes';
import './care/nurses/nurse-detail.css';
import './ProfilePage.css';
import { LoadingNote } from '../../components/admin/LoadingNote';
import { fetchAppAccess, pushToApp, type AppAccess } from '../../admin-native/appSwitch';
import { isNativeAppSwitchAvailable, isOtherAppInstalled, launchOtherApp } from '../../admin-native/nativeAppSwitch';

/** Shared account identity and app switching for staff with both app scopes. */
export function ProfilePage() {
  const { user } = useAuth();
  const canSwitchToNurse = hasScopes(user, ['field:use']);
  const [nurseUrl, setNurseUrl] = useState('');
  const [appAccess, setAppAccess] = useState<AppAccess | null>(null);
  const [loading, setLoading] = useState(canSwitchToNurse);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoSso, setAutoSso] = useState<{ master_enabled: boolean; user_enabled: boolean; admin_allowed: boolean; effective_enabled: boolean } | null>(null);
  const [autoSsoLoading, setAutoSsoLoading] = useState(true);
  const [autoSsoSaving, setAutoSsoSaving] = useState(false);
  const [autoSsoError, setAutoSsoError] = useState('');

  useEffect(() => {
    let live = true;
    apiClient.get<typeof autoSso>('/auth/auto-sso')
      .then((result) => { if (live && result) setAutoSso(result); })
      .catch((reason) => { if (live) setAutoSsoError(reason instanceof Error ? reason.message : 'Automatic sign-in settings could not be loaded.'); })
      .finally(() => { if (live) setAutoSsoLoading(false); });
    return () => { live = false; };
  }, [user?.id]);

  async function updateAutoSso(enabled: boolean) {
    setAutoSsoSaving(true); setAutoSsoError('');
    try {
      const result = await apiClient.patch<typeof autoSso>('/auth/auto-sso', { enabled });
      setAutoSso(result);
    } catch (reason) {
      setAutoSsoError(reason instanceof Error ? reason.message : 'Automatic sign-in preference could not be saved.');
    } finally { setAutoSsoSaving(false); }
  }

  useEffect(() => {
    if (!canSwitchToNurse) return;
    let live = true;
    void Promise.all([
      fetchAppAccess(<T,>(path: string) => apiClient.get<T>(path)),
      apiClient.get<{ url: string }>('/admin/care/switch-app').catch(() => null),
    ])
      .then(([access, legacy]) => { if (live) { setAppAccess(access); setNurseUrl(access.nurse.url ?? legacy?.url ?? ''); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'The nurse app link could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [canSwitchToNurse]);

  async function openNurseApp() {
    setSwitchBusy(true); setError('');
    try {
      const result = await pushToApp('nurse', {
        currentApp: 'admin',
        get: <T,>(path: string) => apiClient.get<T>(path),
        post: <T,>(path: string, body: unknown, headers?: Record<string, string>) => apiClient.post<T>(path, body, { headers }),
        fallbackUrl: nurseUrl,
        native: isNativeAppSwitchAvailable() ? { isInstalled: isOtherAppInstalled, launch: launchOtherApp } : undefined,
      });
      if (result === 'denied') {
        setError('This account cannot use the nurse app.');
        void fetchAppAccess(<T,>(path: string) => apiClient.get<T>(path)).then((access) => { setAppAccess(access); setNurseUrl(access.nurse.url ?? ''); }).catch(() => setAppAccess(null));
      }
      else if (result === 'unavailable') setError('The nurse app link is not available right now.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The nurse app could not be opened.'); }
    finally { setSwitchBusy(false); }
  }

  return <section className="admin-page admin-profile" aria-labelledby="profile-title">
    <header className="page-header"><div><p className="eyebrow">Account</p><h1 id="profile-title">My profile</h1><p>Identity and application access for this staff account.</p></div></header>
    <article className="care-form">
      <h2>Account details</h2>
      <dl className="nurse-facts">
        <div><dt>Name</dt><dd>{user?.name || 'Not available'}</dd></div>
        <div><dt>Email</dt><dd>{user?.email || 'Not available'}</dd></div>
        <div><dt>Account role</dt><dd>{user?.is_superadmin ? 'Super administrator' : 'Staff account'}</dd></div>
      </dl>
      <p>This view is read-only. Email or identity changes must use the verified account administration process; no unverified email-change action is exposed here.</p>
    </article>
    {(appAccess?.nurse.allowed || (!appAccess && canSwitchToNurse)) && <article className="care-form">
      <h2>Nurse application</h2>
      <p>This account can use the nurse app as well. Switching creates an independent nurse-app session; signing out of one app does not sign out of the other.</p>
      {loading ? <LoadingNote>Loading nurse app link…</LoadingNote> : nurseUrl ? <Button type="button" disabled={switchBusy} onClick={() => void openNurseApp()}>{switchBusy ? 'Opening…' : 'Open nurse app'}</Button> : <p>The nurse app URL is not configured for this deployment.</p>}
      {error && <p role="alert">{error}</p>}
    </article>}
    <article className="care-form">
      <h2>Automatic sign-in between apps</h2>
      <Notice tone="warning"><strong>Disabled by default.</strong><p>When enabled and permitted by Superadmin, opening the other authorised Nest app through an automatic sign-in link may sign you in without asking for your password. Only enable this on devices you trust. This setting never grants access to an app or its data.</p></Notice>
      {autoSsoLoading ? <LoadingNote>Loading automatic sign-in preference…</LoadingNote> : autoSso ? <>
        <Checkbox label="Allow automatic sign-in between the admin and nurse apps" checked={autoSso.user_enabled} disabled={autoSsoSaving || !autoSso.admin_allowed} onChange={(event) => void updateAutoSso(event.target.checked)} />
        <p>{!autoSso.admin_allowed ? 'Superadmin has not permitted automatic sign-in for this account.' : autoSso.master_enabled ? 'The Superadmin master switch is ON.' : 'The Superadmin master switch is OFF. Your preference is saved, but automatic sign-in cannot become active until Superadmin enables the master switch.'}</p>
        <p>Effective status: <strong>{autoSso.effective_enabled ? 'ON' : 'OFF'}</strong>.</p>
      </> : <p>Automatic sign-in settings are unavailable. Refresh this page or contact an administrator.</p>}
      {autoSsoError ? <p role="alert">{autoSsoError}</p> : null}
    </article>
    <article className="care-form"><h2>Permissions</h2><ul>{(user?.scopes ?? []).map((scope) => <li key={scope}><code>{scope}</code></li>)}</ul></article>
  </section>;
}
