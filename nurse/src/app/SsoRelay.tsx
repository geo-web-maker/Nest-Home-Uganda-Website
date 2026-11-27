import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api/client';
import { fetchAppAccess } from '../platform/appSwitch';

/** Signed-in nurse-app relay for the optional PKCE pull sign-in from the admin login screen. */
export function SsoRelay({ ready, signedIn }: { ready: boolean; signedIn: boolean }) {
  const [message, setMessage] = useState('Checking the other app sign-in…');
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const target = params.get('target');
      const challenge = params.get('challenge');
      if (target !== 'admin' || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
        setMessage('This sign-in request is not valid. Return to the admin app and try again.');
        return;
      }
      let targetUrl: string | null = null;
      try {
        const configured = import.meta.env.VITE_ADMIN_APP_URL as string | undefined;
        if (configured) {
          const url = new URL(configured);
          if (url.protocol === 'https:') targetUrl = url.toString().replace(/\/$/, '');
        }
      } catch { /* The backend URL below is authoritative for a signed-in user. */ }
      if (signedIn) {
        try {
          const access = await fetchAppAccess(<T,>(path: string) => apiRequest<T>(path));
          if (!active) return;
          targetUrl = access.admin.url ?? targetUrl;
          if (access.handoff_enabled && access.admin.allowed && targetUrl) {
            const issued = await apiRequest<{ code: string }>('/auth/handoff', {
              method: 'POST',
              body: JSON.stringify({ source_app: 'nurse', target_app: 'admin', challenge, mode: access.automatic_sso?.effective_enabled ? 'automatic' : 'manual' }),
            });
            if (!active) return;
            if (/^[A-Za-z0-9_-]{20,100}$/.test(issued.code)) {
              window.location.replace(`${targetUrl}/#handoff=${encodeURIComponent(issued.code)}`);
              return;
            }
          }
        } catch { /* The target login remains a safe fallback. */ }
      }
      if (targetUrl) window.location.replace(`${targetUrl}/#handoff_error=no_session`);
      else setMessage('The admin app address is not configured. Contact the administrator.');
    })();
    return () => { active = false; };
  }, [ready, signedIn]);
  return <main className="login-screen"><div className="login-panel"><p role="status">{message}</p></div></main>;
}
