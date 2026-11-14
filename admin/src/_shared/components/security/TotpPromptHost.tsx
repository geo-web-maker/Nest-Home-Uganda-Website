/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../dialogs/Notice';
import { Modal } from '../dialogs/Modal';
import { apiClient } from '../../lib/api/client';
import { registerTotpPrompt } from '../../lib/totpPrompt';
import styles from './TotpGate.module.css';

type Status = { enabled: boolean; verified: boolean };

/**
 * The authenticator dialog. Opens when a request needs a verified authenticator session and
 * resolves true once the code is accepted, or false if the person closes it.
 */
export function TotpPromptHost() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState('');
  const [authUri, setAuthUri] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const done = useRef<((ok: boolean) => void) | null>(null);

  const reset = () => { setStatus(null); setSecret(''); setAuthUri(''); setCode(''); setRecovery([]); setError(''); setBusy(false); };

  const finish = useCallback((ok: boolean) => {
    setOpen(false);
    reset();
    done.current?.(ok);
    done.current = null;
  }, []);

  useEffect(() => registerTotpPrompt(() => new Promise<boolean>((resolve) => {
    done.current = resolve;
    reset();
    setOpen(true);
    apiClient.get<Status>('/mail/totp/status', { retryOn401: false })
      .then((s) => {
        if (s.enabled && s.verified) finish(true); // already verified elsewhere, just repeat the request
        else setStatus(s);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not check authenticator status.'));
  })), [finish]);

  if (!open) return null;

  async function enrol() {
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ secret: string; otpauth_uri: string }>('/mail/totp/enroll', {});
      setSecret(result.secret); setAuthUri(result.otpauth_uri);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start authenticator setup.');
    } finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true); setError('');
    const value = code.trim();
    try {
      if (secret) {
        const result = await apiClient.post<{ recovery_codes: string[] }>('/mail/totp/confirm', { code: value });
        await apiClient.post('/mail/totp/verify', { code: value });
        setSecret(''); setAuthUri(''); setCode('');
        setRecovery(result.recovery_codes ?? []);
        if (!result.recovery_codes?.length) finish(true);
      } else {
        await apiClient.post('/mail/totp/verify', { code: value });
        finish(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator verification failed. Check the code and try again.');
    } finally { setBusy(false); }
  }

  const enrolled = Boolean(status?.enabled);
  return (
    <Modal id="totp-prompt-title" title="Verify your authenticator" closeLabel="Cancel" onClose={() => finish(false)}
      subtitle="This action needs a current authenticator code. It stays unlocked on this device for up to 12 hours.">
      <div className={styles.body}>
        {error ? <Notice tone="error"><p>{error}</p></Notice> : null}
        {!status && !error ? <Notice>Checking authenticator status…</Notice> : null}

        {recovery.length > 0 ? (
          <>
            <Notice tone="success"><strong>Authenticator enabled.</strong> Save these one-time recovery codes now. They are not shown again.</Notice>
            <ul className={styles.codes}>{recovery.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
            <Button onClick={() => finish(true)}>I have saved them, continue</Button>
          </>
        ) : null}

        {status && !enrolled && !secret && recovery.length === 0 ? (
          <>
            <p>No authenticator is set up on this account yet.</p>
            <Button onClick={() => void enrol()} disabled={busy}>{busy ? 'Starting setup…' : 'Set up authenticator'}</Button>
          </>
        ) : null}

        {secret ? (
          <Notice tone="info">
            <strong>1. Add this account to your authenticator app.</strong>
            <p><a href={authUri}>Open setup link</a> or enter the key by hand:</p>
            <code className={styles.secret}>{secret}</code>
          </Notice>
        ) : null}

        {status && (enrolled || secret) && recovery.length === 0 ? (
          <>
            <Field label={secret ? '2. Current six-digit code' : 'Authenticator code'} value={code} autoFocus
              onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={32}
              onKeyDown={(event) => { if (event.key === 'Enter' && code.trim().length >= 6 && !busy) void submit(); }} />
            <Button onClick={() => void submit()} disabled={busy || code.trim().length < 6}>
              {busy ? 'Verifying…' : secret ? 'Confirm and continue' : 'Verify and continue'}
            </Button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
