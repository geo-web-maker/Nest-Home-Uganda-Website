import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Notice } from '../../../components/admin/Notice';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { ApiError, apiClient } from '../../../lib/api/client';
import styles from './MailPage.module.css';

type TraceStep = { step: string; ok: boolean; ms?: number; detail?: string; smtp_code?: number | null; error_type?: string } & Record<string, unknown>;
type WireLine = { dir: 'client' | 'server'; line: string };
export type SmtpTrace = {
  steps: TraceStep[];
  wire?: WireLine[];
  notes: string[];
  egress_ip?: string | null;
  versions?: Record<string, string>;
};

const SHOWN_ELSEWHERE = new Set(['step', 'ok', 'ms', 'detail', 'smtp_code', 'error_type']);

/** Credential-safe SMTP diagnostics. The server never returns the SMTP password or AUTH payloads. */
export function MailSmtpTrace() {
  const [sendTo, setSendTo] = useState('');
  const [compareKey, setCompareKey] = useState('');
  const [trace, setTrace] = useState<SmtpTrace | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = useMutation({
    mutationFn: () =>
      apiClient.post<SmtpTrace>('/mail/settings/test-send/trace', {
        send_to: sendTo.includes('@') ? sendTo : null,
        compare_key: compareKey || null,
      }),
    onMutate: () => {
      setError('');
      setCopied(false);
    },
    onSuccess: setTrace,
    onError: (err) => {
      setTrace(null);
      setError(err instanceof ApiError && err.status === 403 ? 'Verify your authenticator code above, then run the trace again.' : err instanceof ApiError ? err.message : 'The trace could not be run.');
    },
  });

  const copy = async () => {
    if (!trace) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Full SMTP trace">
      <SectionHeader title="Full SMTP trace" />
      <p className={styles.settingHelp}>
        Shows each Brevo SMTP connection, TLS, authentication and send step, plus server replies. Credentials are represented only by short fingerprints and basic format checks; SMTP AUTH payloads are redacted. Requires a verified authenticator session.
      </p>
      <Field type="email" label="Send a test message to (optional)" value={sendTo} onChange={(event) => setSendTo(event.target.value)} />
      <Field label="Key you know works (optional, to compare with the saved one)" value={compareKey} autoComplete="off" onChange={(event) => setCompareKey(event.target.value)} />
      <ButtonGroup spaced>
        <Button disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Running…' : 'Run full trace'}
        </Button>
        {trace ? (
          <Button variant="outline" onClick={copy}>
            {copied ? 'Copied' : 'Copy everything'}
          </Button>
        ) : null}
      </ButtonGroup>
      {error ? <Notice tone="error" floating onDismiss={() => setError('')}>{error}</Notice> : null}
      {trace ? (
        <>
          {trace.egress_ip ? <p className={styles.settingHelp}>This server reaches the internet as <code>{trace.egress_ip}</code>. Brevo's Authorized IPs must allow it if blocking is on.</p> : null}
          {trace.notes.map((note) => (
            <Notice key={note} tone="info">{note}</Notice>
          ))}
          <ul className={styles.checks}>
            {trace.steps.map((step, index) => {
              const extra = Object.fromEntries(Object.entries(step).filter(([key]) => !SHOWN_ELSEWHERE.has(key)));
              return (
                <li key={`${step.step}-${index}`} className={styles.checkRow}>
                  <Badge tone={step.ok ? 'default' : 'red'}>{step.ok ? 'OK' : 'FAIL'}</Badge>
                  <div>
                    <strong>{step.step}</strong>
                    {step.ms !== undefined ? <span className={styles.settingHelp}> · {step.ms} ms</span> : null}
                    {step.smtp_code ? <span className={styles.settingHelp}> · server code {step.smtp_code}</span> : null}
                    {step.error_type ? <span className={styles.settingHelp}> · {step.error_type}</span> : null}
                    {step.detail ? <p className={styles.settingHelp}>{step.detail}</p> : null}
                    {Object.keys(extra).length ? <pre className={styles.body}>{JSON.stringify(extra, null, 2)}</pre> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {trace.wire?.length ? (
            <>
              <strong>SMTP conversation (after TLS is decrypted; AUTH data redacted)</strong>
              <pre className={styles.body}>
                {trace.wire.map((w) => `${w.dir === 'client' ? 'C: ' : 'S: '}${w.line}`).join('\n')}
              </pre>
            </>
          ) : null}
          {trace.versions ? <p className={styles.settingHelp}>{Object.entries(trace.versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</p> : null}
        </>
      ) : null}
    </section>
  );
}
