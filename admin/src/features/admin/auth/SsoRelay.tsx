import { useEffect, useState } from 'react';
import { apiClient } from '@shared/lib/api/client';
import { fetchAppAccess } from '../../../admin-native/appSwitch';
import { LoadingScreen } from '../../../components/admin/LoadingScreen';
import { useAuth } from './useAuth';

function configuredNurseUrl(): string | null {
  const value = import.meta.env.VITE_NURSE_APP_URL as string | undefined;
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch { return null; }
}

/** Public relay endpoint. The target app name and PKCE challenge are validated; no return URL is accepted. */
export function SsoRelay() {
  const { status } = useAuth();
  const [message, setMessage] = useState('Checking the other app sign-in…');
  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const target = params.get('target');
      const challenge = params.get('challenge');
      if (target !== 'nurse' || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
        setMessage('This sign-in request is not valid. Return to the nurse app and try again.');
        return;
      }
      let targetUrl = configuredNurseUrl();
      if (status === 'signedIn') {
        try {
          const access = await fetchAppAccess(<T,>(path: string) => apiClient.get<T>(path));
          if (!active) return;
          targetUrl = access.nurse.url ?? targetUrl;
          if (access.handoff_enabled && access.nurse.allowed && targetUrl) {
            const issued = await apiClient.post<{ code: string }>('/auth/handoff', {
              source_app: 'admin', target_app: 'nurse', challenge,
              mode: access.automatic_sso?.effective_enabled ? 'automatic' : 'manual',
            });
            if (!active) return;
            if (/^[A-Za-z0-9_-]{20,100}$/.test(issued.code)) {
              window.location.replace(`${targetUrl}/#handoff=${encodeURIComponent(issued.code)}`);
              return;
            }
          }
        } catch { /* The target login is still the safe fallback. */ }
      }
      if (targetUrl) window.location.replace(`${targetUrl}/#handoff_error=no_session`);
      else setMessage('The nurse app address is not configured. Contact the administrator.');
    })();
    return () => { active = false; };
  }, [status]);
  return <LoadingScreen label={message} />;
}
