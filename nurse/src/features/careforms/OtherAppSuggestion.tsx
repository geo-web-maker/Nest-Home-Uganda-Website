import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Card } from '../../ui/Card';
import { PillButton } from '../../ui/PillButton';
import { Banner } from '../../ui/Banner';
import { apiRequest } from '../../lib/api/client';
import { copy } from '../../copy';
import { fetchAppAccess, pushToApp, type AppAccess } from '../../platform/appSwitch';
import { detectChannel, formatSize, type ApkOffer } from '../../platform/appCenter';
import { NativeUpdater } from '../../plugins/NativeUpdater';
import { isNativeAppSwitchAvailable, isOtherAppInstalled, launchOtherApp } from '../../platform/nativeAppSwitch';

type Props = { userId?: string; access: AppAccess | null; permanent?: boolean };

/** Dismissible cross-app suggestion. The permanent switch card remains in the profile below. */
export function OtherAppSuggestion({ userId, access, permanent = false }: Props) {
  const target = 'admin' as const;
  const channel = useMemo(() => detectChannel(), []);
  const native = channel === 'native';
  const canDetectNativeApp = native && isNativeAppSwitchAvailable();
  const entry = access?.admin;
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
    if ((!userId && !permanent) || !entry?.allowed || !entry.url || access?.suggestions_allowed === false) {
      setVisible(false);
      return;
    }
    if (permanent) { setVisible((native && installed === false && entry.apk_available) || access?.handoff_enabled === true); return; }
    const actionAvailable = native && installed === false && entry.apk_available
      ? true
      : access?.handoff_enabled === true;
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
    } catch { /* Storage failure should not prevent the signed-in profile from rendering. */ }
    setVisible(true);
  }, [access?.handoff_enabled, access?.suggestions_allowed, canDetectNativeApp, entry?.allowed, entry?.apk_available, entry?.url, installed, permanent, snoozeKey, userId]);

  useEffect(() => {
    if (installed === true) { setInstallOpen(false); setOffer(null); setProgress(null); }
  }, [installed]);

  useEffect(() => {
    if (!installOpen || offer) return;
    let live = true;
    setOfferLoading(true);
    setInstallError('');
    void apiRequest<ApkOffer & { update?: boolean }>('/app-bundles/admin/apk?current=0.0.0')
      .then((result) => {
        if (!live) return;
        if (!result.url || result.update === false) throw new Error(copy.appSwitch.noApk);
        setOffer(result);
      })
      .catch((error) => { if (live) setInstallError(error instanceof Error ? error.message : copy.appSwitch.installError); })
      .finally(() => { if (live) setOfferLoading(false); });
    return () => { live = false; };
  }, [installOpen, offer]);

  async function openOtherApp() {
    if (!entry?.url) return;
    try {
      const result = await pushToApp(target, {
        currentApp: 'nurse',
        get: <T,>(path: string) => apiRequest<T>(path),
        post: <T,>(path: string, body: unknown, headers?: Record<string, string>) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body), headers }),
        fallbackUrl: entry.url,
        native: isNativeAppSwitchAvailable() ? { isInstalled: isOtherAppInstalled, launch: launchOtherApp } : undefined,
      });
      if (result === 'denied') { setVisible(false); void fetchAppAccess(<T,>(path: string) => apiRequest<T>(path)).catch(() => undefined); }
      else if (result === 'unavailable') setInstallError(copy.appSwitch.unavailable);
    } catch { setInstallError(copy.appSwitch.unavailable); }
  }

  async function installOtherApp() {
    if (!offer?.url) return;
    setInstalling(true); setProgress(0); setInstallError('');
    try {
      await NativeUpdater.downloadAndInstall(
        { url: offer.url, sha256: offer.sha256, fileName: `admin-${offer.version}.apk` },
        (event) => {
          if (event.type === 'progress') setProgress(event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0);
          else setProgress(100);
        },
      );
      setInstallError(copy.appSwitch.installLaunched);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : copy.appSwitch.installError);
    } finally { setInstalling(false); }
  }

  function dismiss() {
    try { localStorage.setItem(snoozeKey, String(Date.now())); } catch { /* Best effort only. */ }
    setVisible(false);
    setInstallOpen(false);
  }

  if (!visible || !entry?.allowed || !entry.url) return null;
  const getApp = native && installed === false && entry.apk_available;
  const title = getApp ? copy.appSwitch.getAdmin : copy.appSwitch.openAdmin;
  return <Card className="mk-profile-section other-app-suggestion">
    <div className="mk-profile-section__heading"><h3>{copy.appSwitch.suggestionTitle}</h3><PillButton tone="ghost" size="sm" onClick={dismiss}>{copy.appSwitch.dismiss}</PillButton></div>
    <Banner tone="info">{getApp ? copy.appSwitch.getAdminHelp : copy.appSwitch.openAdminHelp}</Banner>
    {installError && <Banner tone="warn">{installError}</Banner>}
    {getApp ? <PillButton tone="gold" disabled={installing || offerLoading} onClick={() => setInstallOpen(true)}>{offerLoading ? copy.appSwitch.checkingApk : copy.appSwitch.getAdmin}</PillButton>
      : <PillButton tone="gold" onClick={() => void openOtherApp()}>{title}</PillButton>}
    {installOpen && <div className="other-app-install-sheet" role="region" aria-label={copy.appSwitch.installTitle}>
      <h4>{copy.appSwitch.installTitle}</h4>
      {offerLoading && <p role="status">{copy.appSwitch.checkingApk}</p>}
      {offer && <><p>{copy.appSwitch.version} {offer.version} · {formatSize(offer.size_bytes) || copy.appSwitch.sizeUnknown}</p><p>{copy.appSwitch.androidInstallPermission}</p>
        <PillButton tone="gold" disabled={installing} onClick={() => void installOtherApp()}>{installing ? copy.appSwitch.installing : copy.appSwitch.downloadInstall}</PillButton>
      </>}
      {progress !== null && <progress value={progress} max={100} aria-label={copy.appSwitch.downloadProgress} />}
      <PillButton tone="ghost" disabled={installing} onClick={() => { setInstallOpen(false); setOffer(null); setProgress(null); }}>{copy.appSwitch.close}</PillButton>
    </div>}
  </Card>;
}
