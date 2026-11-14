/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../dialogs/Notice';
import { SectionHeader } from '../dialogs/SectionHeader';
import { apiClient } from '../../lib/api/client';
import styles from './TotpGate.module.css';

type TotpStatus = { enabled: boolean; verified: boolean };
type Enrollment = { secret: string; otpauth_uri: string };
type Confirmed = { recovery_codes: string[] };

/** Locks sensitive audit views until the signed-in account has a verified TOTP session. */
export function TotpGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [secret, setSecret] = useState('');
  const [authUri, setAuthUri] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setStatus(await apiClient.get<TotpStatus>('/mail/totp/status', { retryOn401: false }));
    } catch (reason) {
      setStatus(null);
      setError(reason instanceof Error ? reason.message : 'Could not check authenticator status.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function beginEnrollment() {
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<Enrollment>('/mail/totp/enroll', {});
      setSecret(result.secret);
      setAuthUri(result.otpauth_uri);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start authenticator setup.');
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError('');
    try {
      if (secret) {
        const result = await apiClient.post<Confirmed>('/mail/totp/confirm', { code: code.trim() });
        await apiClient.post('/mail/totp/verify', { code: code.trim() });
        setStatus({ enabled: true, verified: true });
        setRecoveryCodes(result.recovery_codes ?? []);
        setSecret(''); setAuthUri(''); setCode('');
      } else {
        await apiClient.post('/mail/totp/verify', { code: code.trim() });
        setCode('');
        await refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator verification failed. Check the code and try again.');
    } finally { setBusy(false); }
  }

  if (status?.enabled && status.verified && recoveryCodes.length === 0) return <>{children}</>;

  return (
    <section className={styles.gate} aria-labelledby="audit-totp-heading">
      <SectionHeader
        title="Verify your identity to view audit records"
        note="Audit history can contain sensitive account, security and care-operation metadata. A current authenticator check is required."
      />
      {checking ? <Notice>Checking authenticator status…</Notice> : null}
      {error ? <Notice tone="error"><p>{error}</p><Button variant="outline" size="compact" onClick={() => void refresh()}>Retry status check</Button></Notice> : null}
      {!checking && status && !status.enabled && !secret && !recoveryCodes.length ? (
        <div className={styles.body}>
          <p>Your account has not enrolled an authenticator yet. Set one up to unlock this page.</p>
          <Button onClick={() => void beginEnrollment()} disabled={busy}>{busy ? 'Starting setup…' : 'Set up authenticator'}</Button>
        </div>
      ) : null}
      {secret ? (
        <div className={styles.body}>
          <Notice tone="info">
            <strong>1. Add this account to an authenticator app.</strong>
            <p>Scan the setup link when your authenticator supports it, or enter the key manually.</p>
            <p><a href={authUri}>Open authenticator setup link</a></p>
            <code className={styles.secret}>{secret}</code>
            <p>This key is shown once. Do not share it.</p>
          </Notice>
          <Field label="2. Current six-digit authenticator code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
          <Button onClick={() => void verify()} disabled={busy || code.trim().length < 6}>{busy ? 'Verifying…' : 'Confirm and unlock'}</Button>
        </div>
      ) : null}
      {!checking && status?.enabled && !status.verified && !recoveryCodes.length ? (
        <div className={styles.body}>
          <p>Enter the current code from your authenticator app. The verified session is valid for up to 12 hours on this device.</p>
          <Field label="Authenticator code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={32} />
          <Button onClick={() => void verify()} disabled={busy || code.trim().length < 6}>{busy ? 'Verifying…' : 'Verify and unlock audit history'}</Button>
        </div>
      ) : null}
      {recoveryCodes.length > 0 ? (
        <div className={styles.body}>
          <Notice tone="success"><strong>Authenticator enabled.</strong> Save these one-time recovery codes in a secure place before continuing. They will not be shown again.</Notice>
          <ul className={styles.codes}>{recoveryCodes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
          <Button onClick={() => setRecoveryCodes([])}>I have saved my recovery codes</Button>
        </div>
      ) : null}
    </section>
  );
}
