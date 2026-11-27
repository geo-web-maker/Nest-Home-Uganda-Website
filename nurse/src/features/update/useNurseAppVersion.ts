import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../../lib/api/client';
import { APP_VERSION, copy, getInstalledVersion } from '../../copy';
import { isForcedUpdate } from '../../lib/version';

export type NurseVersionInfo = {
  latest: string | null;
  min_supported: string;
  has_releases?: boolean;
  download_path?: string | null;
  apk_info?: { url: string; sha256?: string | null; version: string } | null;
};

type UseNurseAppVersionOptions = {
  token: string;
  signedIn: boolean;
  setMessage: (message: string) => void;
};

/** Owns authenticated version checks and the public pre-login minimum-version gate. */
export function useNurseAppVersion({ token, signedIn, setMessage }: UseNurseAppVersionOptions) {
  const [versionInfo, setVersionInfo] = useState<NurseVersionInfo | null>(null);
  const [preLoginBlocked, setPreLoginBlocked] = useState(false);
  const [preLoginMinimum, setPreLoginMinimum] = useState('0.0.0');
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const appVersion = installedVersion ?? APP_VERSION;

  useEffect(() => {
    void getInstalledVersion().then(setInstalledVersion).catch(() => setInstalledVersion(null));
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const platform = Capacitor.getPlatform();
      const version = await apiRequest<{
        latest: string;
        min_supported: string;
        download_path?: string | null;
      }>(`/field/app/version?platform=${platform === 'ios' || platform === 'android' ? platform : 'web'}`);
      // Reject malformed responses before they can reach the version comparator or render path.
      if (typeof version?.latest !== 'string' || typeof version?.min_supported !== 'string') {
        throw new Error('Invalid version response');
      }
      let apk_info: NurseVersionInfo['apk_info'] = null;
      if (platform === 'android') {
        try {
          const apk = await apiRequest<{ url: string; sha256?: string | null; version: string }>('/field/app/apk?platform=android');
          if (apk?.url) apk_info = apk;
        } catch {
          // APK endpoint is optional until a signed release is available.
        }
      }
      setVersionInfo({ ...version, apk_info });
      setMessage(copy.messages.versionRefreshed);
    } catch {
      setMessage(copy.messages.updateUnavailable);
    }
  }, [setMessage]);

  useEffect(() => {
    if (token) void checkForUpdate();
  }, [token, checkForUpdate]);

  useEffect(() => {
    if (signedIn || installedVersion === null) return;
    const platform = Capacitor.getPlatform();
    if (platform !== 'android' && platform !== 'ios') {
      setPreLoginBlocked(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
        const url = `${apiBase}/api/v1/app-bundles/nurse/version?current=${encodeURIComponent(installedVersion)}&platform=${platform}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return;
        const data = await response.json() as { blocked?: boolean; min_supported?: string };
        if (!active) return;
        if (
          data.blocked &&
          typeof data.min_supported === 'string' &&
          isForcedUpdate(installedVersion, data.min_supported)
        ) {
          setPreLoginMinimum(data.min_supported);
          setPreLoginBlocked(true);
        } else {
          setPreLoginBlocked(false);
        }
      } catch {
        // Network unavailable: allow a sign-in attempt; the server remains authoritative.
      }
    })();
    return () => { active = false; };
  }, [installedVersion, signedIn]);

  const updateBlocked = preLoginBlocked || Boolean(versionInfo && isForcedUpdate(appVersion, versionInfo.min_supported));

  return {
    versionInfo,
    preLoginBlocked,
    preLoginMinimum,
    installedVersion,
    appVersion,
    updateBlocked,
    checkForUpdate,
  };
}
