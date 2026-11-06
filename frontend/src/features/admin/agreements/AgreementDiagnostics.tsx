import { useEffect, useState } from 'react';
import { Notice } from '../../../components/admin/Notice';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import styles from './AgreementDiagnostics.module.css';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
type SetupCheck = { id: string; status: CheckStatus; detail: string };
type CheckSummary = Record<CheckStatus, number>;
type Run = { checks: SetupCheck[]; summary: CheckSummary };
type Delivery = { check: SetupCheck };

const tone: Record<CheckStatus, 'default' | 'new' | 'red' | 'muted'> = {
  pass: 'default', warn: 'new', fail: 'red', skip: 'muted',
};

function Summary({ summary }: { summary: CheckSummary }) {
  const clean = summary.fail === 0 && summary.warn === 0;
  return (
    <Notice tone={summary.fail > 0 ? 'error' : clean ? 'success' : 'info'}>
      {clean ? 'All reported checks passed.' : `${summary.pass} passed · ${summary.warn} warnings · ${summary.fail} failed · ${summary.skip} skipped.`}
    </Notice>
  );
}

function CheckRows({ checks }: { checks: SetupCheck[] }) {
  if (!checks.length) return null;
  return (
    <ul className={styles.checks}>
      {checks.map((item, index) => (
        <li className={styles.check} key={`${item.id}-${index}`}>
          <Badge tone={tone[item.status]}>{item.status.toUpperCase()}</Badge>
          <div><strong>{item.id.replaceAll('_', ' ')}</strong><p>{item.detail}</p></div>
        </li>
      ))}
    </ul>
  );
}

/** Protected checks for the complete Bloomwell agreement path. */
export function AgreementDiagnostics({ canRunWorkflow, canSeedTemplate = false }: { canRunWorkflow: boolean; canSeedTemplate?: boolean }) {
  const [readiness, setReadiness] = useState<Run | null>(null);
  const [workflow, setWorkflow] = useState<Run | null>(null);
  const [delivery, setDelivery] = useState<Record<string, SetupCheck>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [seedMessage, setSeedMessage] = useState('');
  const [targets, setTargets] = useState<{ email: string | null; phone: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    apiClient.get<{ email: string | null; phone: string | null }>('/admin/agreements/diagnostics/delivery-targets')
      .then((result) => { if (live) setTargets(result); }).catch(() => { if (live) setTargets(null); });
    return () => { live = false; };
  }, []);

  const run = async (kind: 'run' | 'workflow') => {
    setBusy(kind); setError('');
    try {
      const result = await apiClient.post<Run>(`/admin/agreements/diagnostics/${kind}`, {});
      if (kind === 'run') setReadiness(result); else setWorkflow(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The agreement diagnostic could not be completed.');
    } finally { setBusy(''); }
  };

  const seedTemplate = async () => {
    setBusy('seed'); setError(''); setSeedMessage('');
    try {
      const result = await apiClient.post<{ created: number; message: string }>('/admin/agreements/template/seed', {});
      setSeedMessage(result.message);
      await run('run');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The source template could not be installed.');
    } finally { setBusy(''); }
  };

  const sendTest = async (channel: 'email' | 'sms') => {
    setBusy(channel); setError('');
    try {
      const result = await apiClient.post<Delivery>(`/admin/agreements/diagnostics/delivery-test/${channel}`, {});
      setDelivery((current) => ({ ...current, [channel]: result.check }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The staff ${channel} test failed.`);
    } finally { setBusy(''); }
  };

  return (
    <section className={styles.panel} aria-label="Agreement diagnostics">
      <SectionHeader title="Agreement workflow diagnostics" />
      <p className={styles.help}>
        Run this before enabling customer sends and after any change to templates, authentication,
        storage or notification settings. All actions require a recently verified authenticator session.
      </p>
      <Notice tone="info">
        The full workflow simulation uses synthetic names and test-only consent/signatures. It exercises
        the real database, OTP, signing, countersigning and private-PDF services, but intercepts all
        customer email/SMS. Its temporary agreement, OTPs, signatures and PDF are deleted afterwards.
      </Notice>
      <div className={styles.actions}>
        <Button disabled={Boolean(busy)} onClick={() => void run('run')}>
          {busy === 'run' ? 'Checking…' : 'Run readiness checks'}
        </Button>
        <Button variant="outline" disabled={Boolean(busy) || !canRunWorkflow} onClick={() => void run('workflow')}>
          {busy === 'workflow' ? 'Simulating…' : 'Run full workflow simulation'}
        </Button>
      </div>
      {!canRunWorkflow && <p className={styles.help}>The full simulation also requires the `agreements:sign` scope. Readiness checks and staff delivery tests require `agreements:diagnostics`.</p>}

      <div className={styles.selfTests}>
        <h3>Real notification delivery tests</h3>
        <p className={styles.help}>These send a clearly labelled test only to your own signed-in staff account email or saved staff mobile number. They never use a client contact.</p>
        <ul className={styles.help}>
          <li>Email goes to your <strong>staff login email</strong>{targets?.email ? <>: <strong>{targets.email}</strong></> : <>, which is missing or invalid on your profile</>}. It is not a shared mailbox such as info@bhcug.com.</li>
          <li>SMS goes to the <strong>mobile number saved on your staff profile</strong>{targets?.phone ? <>: <strong>{targets.phone}</strong></> : <>, which is missing or not a Uganda mobile</>}.</li>
          <li>Not arriving? Check spam and promotions, confirm the address above is one you can open, and run the Mail section's SPF, DKIM and DMARC checks for bhcug.com. "Provider accepted" only means the provider queued it.</li>
        </ul>
        <div className={styles.actions}>
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void sendTest('email')}>
            {busy === 'email' ? 'Sending…' : 'Send test email to me'}
          </Button>
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => void sendTest('sms')}>
            {busy === 'sms' ? 'Sending…' : 'Send test SMS to me'}
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {seedMessage && <Notice tone="success">{seedMessage}</Notice>}
      {canSeedTemplate && readiness?.checks.some((item) => item.id === 'agreement_template' && item.status === 'fail') && (
        <div className={styles.selfTests}>
          <h3>Install agreement wording</h3>
          <p className={styles.help}>No published agreement wording exists. This installs the reviewed source PDF wording (published as the first version on an empty database; saved as an unpublished draft if another version is already live). Requires a recently verified authenticator session.</p>
          <div className={styles.actions}>
            <Button disabled={Boolean(busy)} onClick={() => void seedTemplate()}>{busy === 'seed' ? 'Installing…' : 'Install source template'}</Button>
          </div>
        </div>
      )}
      {readiness && <div className={styles.result}><h3>Readiness results</h3><Summary summary={readiness.summary} /><CheckRows checks={readiness.checks} /></div>}
      {workflow && <div className={styles.result}><h3>Full workflow results</h3><Summary summary={workflow.summary} /><CheckRows checks={workflow.checks} /></div>}
      {Object.keys(delivery).length > 0 && <div className={styles.result}><h3>Staff delivery results</h3><CheckRows checks={Object.values(delivery)} /></div>}
      <p className={styles.help}>
        A provider-accepted email or SMS is not proof of inbox/handset delivery. Confirm receipt on your
        device, and also run the Mail section’s SPF, DKIM, DMARC and outbox diagnostics before launch.
      </p>
    </section>
  );
}
