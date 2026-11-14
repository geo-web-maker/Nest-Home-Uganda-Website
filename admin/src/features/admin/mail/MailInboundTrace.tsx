import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Badge } from '@shared/components/ui/Badge';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { ApiError, apiClient } from '@shared/lib/api/client';
import styles from './MailPage.module.css';

type Step = { step: string; ok: boolean | null; ms?: number; detail?: string } & Record<string, unknown>;
type Attempt = {
  at: string; outcome: string; reason?: string | null; http_status?: number | null; envelope_to?: string[] | null;
  routing?: Array<{ address: string; status: string }> | null; object_key?: string | null; size_bytes?: number | null;
  remote_ip?: string | null; user_agent?: string | null; skew_seconds?: number | null; ms?: number | null;
};
export type InboundTrace = { steps: Step[]; notes: string[]; attempts: Attempt[] };

const SHOWN_ELSEWHERE = new Set(['step', 'ok', 'ms', 'detail']);
const OUTCOME_TONE: Record<string, 'default' | 'red'> = { delivered: 'default', duplicate: 'default' };

/** Traces incoming mail hop by hop and lists what the email worker has really sent to this server. */
export function MailInboundTrace() {
  const [address, setAddress] = useState('');
  const [trace, setTrace] = useState<InboundTrace | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = useMutation({
    mutationFn: () => apiClient.post<InboundTrace>('/mail/diagnostics/inbound/trace', { address: address.includes('@') ? address.trim() : null }),
    onMutate: () => { setError(''); setCopied(false); },
    onSuccess: setTrace,
    onError: (err) => {
      setTrace(null);
      setError(err instanceof ApiError && err.status === 403 ? 'Verify your authenticator code above, then run the trace again.' : err instanceof ApiError ? err.message : 'The trace could not be run.');
    },
  });

  const copy = async () => {
    if (!trace) return;
    try { await navigator.clipboard.writeText(JSON.stringify(trace, null, 2)); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <section className={styles.panel} aria-label="Incoming mail trace">
      <SectionHeader title="Incoming mail trace" />
      <Field type="email" label="Address that is not receiving mail (optional)" value={address} onChange={(event) => setAddress(event.target.value)} />
      <ButtonGroup spaced>
        <Button disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Running…' : 'Run incoming trace'}</Button>
        {trace ? <Button variant="outline" onClick={copy}>{copied ? 'Copied' : 'Copy everything'}</Button> : null}
      </ButtonGroup>
      {error ? <Notice tone="error" floating onDismiss={() => setError('')}>{error}</Notice> : null}
      {trace ? (
        <>
          {trace.notes.map((note) => <Notice key={note} tone="info">{note}</Notice>)}
          <ul className={styles.checks}>
            {trace.steps.map((step, index) => {
              const extra = Object.fromEntries(Object.entries(step).filter(([key]) => !SHOWN_ELSEWHERE.has(key)));
              return (
                <li key={`${step.step}-${index}`} className={styles.checkRow}>
                  <Badge tone={step.ok === null ? 'default' : step.ok ? 'default' : 'red'}>{step.ok === null ? 'INFO' : step.ok ? 'OK' : 'FAIL'}</Badge>
                  <div>
                    <strong>{step.step}</strong>
                    {step.ms !== undefined ? <span className={styles.settingHelp}> · {step.ms} ms</span> : null}
                    {step.detail ? <p className={styles.settingHelp}>{step.detail}</p> : null}
                    {Object.keys(extra).length ? <pre className={styles.body}>{JSON.stringify(extra, null, 2)}</pre> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <strong>Recent requests to the inbound endpoint</strong>
          {trace.attempts.length === 0 ? <p className={styles.settingHelp}>None recorded yet.</p> : (
            <ul className={styles.checks}>
              {trace.attempts.map((a, index) => (
                <li key={`${a.at}-${index}`} className={styles.checkRow}>
                  <Badge tone={OUTCOME_TONE[a.outcome] ?? 'red'}>{a.outcome.toUpperCase()}</Badge>
                  <div>
                    <strong>{new Date(a.at).toLocaleString()}</strong>
                    <span className={styles.settingHelp}> · HTTP {a.http_status ?? '?'}{a.ms != null ? ` · ${a.ms} ms` : ''}{a.skew_seconds != null ? ` · clock skew ${a.skew_seconds}s` : ''}</span>
                    {a.reason ? <p className={styles.settingHelp}>{a.reason}</p> : null}
                    <p className={styles.settingHelp}>To: {(a.envelope_to ?? []).join(', ') || '(none)'} · from {a.remote_ip ?? 'unknown'} · {a.user_agent || 'no user agent'}</p>
                    {a.routing?.length ? <pre className={styles.body}>{a.routing.map((r) => `${r.address || '(no recipient)'}  →  ${r.status}`).join('\n')}</pre> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
