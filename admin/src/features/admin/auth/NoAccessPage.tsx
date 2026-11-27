import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@shared/components/ui/Button';
import { normaliseUgPhone } from '@shared/lib/phone';
import { apiClient } from '@shared/lib/api/client';
import { useSiteSettings } from '@shared/lib/queries/site';
import { useAuth } from './useAuth';
import { fetchAppAccess, pushToApp, type AppAccess } from '../../../admin-native/appSwitch';
import { isNativeAppSwitchAvailable, isOtherAppInstalled, launchOtherApp } from '../../../admin-native/nativeAppSwitch';
import styles from './LoginPage.module.css';

type Props = { access?: AppAccess | null; accessError?: string };

/** Shown to a signed-in account that is not authorised for the admin application. */
export function NoAccessPage({ access: suppliedAccess, accessError = '' }: Props) {
  const { t } = useTranslation('admin');
  const { logout } = useAuth();
  const { data: site } = useSiteSettings();
  const [access, setAccess] = useState<AppAccess | null>(suppliedAccess ?? null);
  const [loading, setLoading] = useState(!suppliedAccess && !accessError);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(accessError);
  const businessPhone = site?.business?.phone ?? '';
  const normalised = normaliseUgPhone(businessPhone);

  useEffect(() => {
    if (suppliedAccess || accessError) return;
    let live = true;
    fetchAppAccess(<T,>(path: string) => apiClient.get<T>(path))
      .then((result) => { if (live) setAccess(result); })
      .catch((reason) => { if (live) setMessage(reason instanceof Error ? reason.message : 'Application access could not be verified.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [suppliedAccess, accessError]);

  async function openNurseApp() {
    const target = access?.nurse;
    if (!target?.allowed) return;
    setBusy(true); setMessage('');
    try {
      const result = await pushToApp('nurse', {
        currentApp: 'admin',
        get: <T,>(path: string) => apiClient.get<T>(path),
        post: <T,>(path: string, body: unknown, headers?: Record<string, string>) => apiClient.post<T>(path, body, { headers }),
        fallbackUrl: target.url ?? undefined,
        native: isNativeAppSwitchAvailable() ? { isInstalled: isOtherAppInstalled, launch: launchOtherApp } : undefined,
      });
      if (result !== 'navigated') setMessage(result === 'denied' ? 'This account cannot use the nurse app.' : 'The nurse app address is unavailable.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The nurse app could not be opened.'); }
    finally { setBusy(false); }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('noAccess.title')}</h1>
        <p>{t('noAccess.callLabel')}{' '}<a href={normalised ? `tel:${normalised}` : undefined}>{businessPhone || 'Contact the administrator'}</a></p>
        {loading ? <p>Checking whether this account can use the nurse app…</p> : null}
        {!loading && access?.nurse.allowed ? <>
          <p>This account is not authorised to use the admin app, but it is authorised for the nurse app.</p>
          <Button type="button" disabled={busy} onClick={() => void openNurseApp()}>{busy ? 'Opening…' : 'Open nurse app'}</Button>
        </> : null}
        {message ? <p role="alert">{message}</p> : null}
        {accessError && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Retry access check</Button>}
        <Button type="button" variant="outline" onClick={() => void logout()}>{t('noAccess.signOut')}</Button>
      </div>
    </main>
  );
}
