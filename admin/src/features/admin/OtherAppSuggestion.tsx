import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { Button } from '@shared/components/ui/Button';
import { Notice } from '@shared/components/dialogs/Notice';
import { apiClient } from '@shared/lib/api/client';
import { fetchAppAccess, pushToApp, type AppAccess } from '../../admin-native/appSwitch';
import { detectChannel, formatSize, type ApkOffer } from '../../admin-native/appCenter';
import { NativeUpdater } from '../../admin-native/nativeUpdater';
import { isNativeAppSwitchAvailable, isOtherAppInstalled, launchOtherApp } from '../../admin-native/nativeAppSwitch';

type Props = { userId?: string; access: AppAccess | null; visibleOnThisPage?: boolean; permanent?: boolean };

/** Dismissible, per-user cross-app suggestion; the account menu/profile switch stays permanent. */
export function OtherAppSuggestion({ userId, access, visibleOnThisPage = false, permanent = false }: Props) {
  const { t } = useTranslation('admin');
  const target = 'nurse' as const;
  const channel = useMemo(() => detectChannel(), []);
  const native = channel === 'native';
  const canDetectNativeApp = native && isNativeAppSwitchAvailable();
  const entry = access?.nurse;
  const snoozeKey = `nhc.suggest.${userId ?? 'app-center'}.${target}`;
  const [installed, setInstalled] = useState<boolean | null>(canDetectNativeApp ? null : false);
  const [visible, setVisible] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [offer, setOffer] = useState<ApkOffer | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [installError, setInstallError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);

  const refreshInstalled = useCallback(async () => {
    if (!canDetectNativeApp || !entry?.android_package) return;
    try { setInstalled(await isOtherAppInstalled(entry.android_package)); }
    catch { setInstalled(false); }
  }, [canDetectNativeApp, entry?.android_package]);

  useEffect(() => {
    if (!canDetectNativeApp) return;
    setInstalled(null);
    void refreshInstalled();
    if (!Capacitor.isPluginAvailable('App')) return;
    let live = true;
    let listener: { remove: () => Promise<void> } | undefined;
    void App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refreshInstalled(); })
      .then((handle) => { if (live) listener = handle; else void handle.remove(); })
      .catch(() => undefined);
    return () => { live = false; if (listener) void listener.remove(); };
  }, [canDetectNativeApp, refreshInstalled]);

  useEffect(() => {
    if ((!permanent && (!visibleOnThisPage || !userId)) || !entry?.allowed || !entry.url || access?.suggestions_allowed === false) {
      setVisible(false);
      return;
    }
    if (permanent) { setVisible((native && installed === false && entry.apk_available) || access?.handoff_enabled === true); return; }
    const getAppAvailable = native && installed === false && entry.apk_available;
    const actionAvailable = getAppAvailable || access?.handoff_enabled === true;
    if (!actionAvailable || (canDetectNativeApp && installed === null)) {
      setVisible(false);
      return;
    }
    try {
      const lastDismissed = Number(localStorage.getItem(snoozeKey) ?? 0);
      if (lastDismissed && Date.now() - lastDismissed < 14 * 24 * 60 * 60 * 1000) {
        setVisible(false);
        return;
      }
      if (sessionStorage.getItem('nhc.suggest.shown') === '1') {
        setVisible(false);
        return;
      }
      sessionStorage.setItem('nhc.suggest.shown', '1');
    } catch { /* Storage failures should not block the admin screens. */ }
    setVisible(true);
  }, [access?.handoff_enabled, access?.suggestions_allowed, canDetectNativeApp, entry?.allowed, entry?.apk_available, entry?.url, installed, snoozeKey, userId, visibleOnThisPage, permanent]);

  useEffect(() => {
    if (!installOpen || offer) return;
    let live = true;
    setOfferLoading(true);
    setInstallError('');
    void apiClient.get<ApkOffer & { update?: boolean }>('/app-bundles/nurse/apk?current=0.0.0')
      .then((result) => {
        if (!live) return;
        if (!result.url || result.update === false) throw new Error(t('appSwitch.noApk'));
        setOffer(result);
      })
      .catch((error) => { if (live) setInstallError(error instanceof Error ? error.message : t('appSwitch.installError')); })
      .finally(() => { if (live) setOfferLoading(false); });
    return () => { live = false; };
  }, [installOpen, offer, t]);

  async function openOtherApp() {
    if (!entry?.url) return;
    try {
      const result = await pushToApp(target, {
        currentApp: 'admin',
        get: <T,>(path: string) => apiClient.get<T>(path),
        post: <T,>(path: string, body: unknown, headers?: Record<string, string>) => apiClient.post<T>(path, body, { headers }),
        fallbackUrl: entry.url,
        native: isNativeAppSwitchAvailable() ? { isInstalled: isOtherAppInstalled, launch: launchOtherApp } : undefined,
      });
      if (result === 'denied') { setVisible(false); void fetchAppAccess(<T,>(path: string) => apiClient.get<T>(path)).catch(() => undefined); }
      else if (result === 'unavailable') setInstallError(t('appSwitch.unavailable'));
    } catch { setInstallError(t('appSwitch.unavailable')); }
  }

  async function installOtherApp() {
    if (!offer?.url) return;
    setInstalling(true); setProgress(0); setInstallError('');
    try {
      await NativeUpdater.downloadAndInstall(
        { url: offer.url, sha256: offer.sha256, fileName: `nurse-${offer.version}.apk` },
        (event) => {
          if (event.type === 'progress') setProgress(event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0);
          else setProgress(100);
        },
      );
      setInstallError(t('appSwitch.installLaunched'));
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : t('appSwitch.installError'));
    } finally { setInstalling(false); }
  }

  function dismiss() {
    try { localStorage.setItem(snoozeKey, String(Date.now())); } catch { /* Best effort only. */ }
    setVisible(false);
    setInstallOpen(false);
  }

  if (!visible || !entry?.allowed || !entry.url) return null;
  const getApp = native && installed === false && entry.apk_available;
  return <section className="care-form other-app-suggestion" aria-label={t('appSwitch.suggestionTitle')}>
    <div className="app-center-block">
      <div className="page-header"><div><h2>{t('appSwitch.suggestionTitle')}</h2><p>{getApp ? t('appSwitch.getNurseHelp') : t('appSwitch.openNurseHelp')}</p></div><Button variant="outline" size="compact" type="button" onClick={dismiss}>{t('appSwitch.dismiss')}</Button></div>
      {installError && <Notice tone="error">{installError}</Notice>}
      {getApp ? <Button variant="forest" type="button" disabled={offerLoading || installing} onClick={() => setInstallOpen(true)}>{offerLoading ? t('appSwitch.checkingApk') : t('appSwitch.getNurse')}</Button>
        : <Button variant="forest" type="button" onClick={() => void openOtherApp()}>{t('appSwitch.openNurse')}</Button>}
      {installOpen && <div className="other-app-install-sheet" role="region" aria-label={t('appSwitch.installTitle')}>
        <h3>{t('appSwitch.installTitle')}</h3>
        {offerLoading && <p role="status">{t('appSwitch.checkingApk')}</p>}
        {offer && <><p>{t('appSwitch.version')} {offer.version} · {formatSize(offer.size_bytes) || t('appSwitch.sizeUnknown')}</p><p>{t('appSwitch.androidInstallPermission')}</p>
          <Button variant="forest" type="button" disabled={installing} onClick={() => void installOtherApp()}>{installing ? t('appSwitch.installing') : t('appSwitch.downloadInstall')}</Button>
        </>}
        {progress !== null && <progress value={progress} max={100} aria-label={t('appSwitch.downloadProgress')} />}
        <Button variant="outline" type="button" disabled={installing} onClick={() => { setInstallOpen(false); setOffer(null); setProgress(null); }}>{t('appSwitch.close')}</Button>
      </div>}
    </div>
  </section>;
}
