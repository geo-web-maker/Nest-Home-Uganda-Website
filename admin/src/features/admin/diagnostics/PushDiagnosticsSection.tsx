import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Badge } from '@shared/components/ui/Badge';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';
import { CHECK_TONE } from '../mail/settings';
import styles from './Diagnostics.module.css';

type Status = 'pass' | 'warn' | 'fail' | 'skip';
type Check = { id: string; status: Status; detail: string };
type App = 'any' | 'admin' | 'nurse';
type Device = {
  app: string; device_id: string; user_name: string | null; user_email: string | null; platform: string; has_token: boolean;
  token_preview: string | null; token_age_days: number | null; registered_at: string | null; revoked_at: string | null;
};
type Delivery = { id: string; user_id: string; category: string; title: string; status: string; attempts: number; last_error: string | null; help: string; created_at: string | null };
type SendResult = { ok: boolean; stage?: string; error?: string; detail?: string; help?: string; note?: string; http_status?: number; elapsed_ms?: number; validate_only?: boolean; message_name?: string; sender_setting?: string };
type ScenarioResult = { ok: boolean; mode: string; note: string | null; to?: string; critical?: boolean; results: { device_id: string; status: string; error?: string | null; help?: string }[] };
type Pipeline = { mode: string; note: string | null; results: { device_id: string; status: string }[] };

const BASE = '/admin/push/diagnostics';
const APPS: { value: App; label: string }[] = [{ value: 'any', label: 'Both apps' }, { value: 'admin', label: 'Admin app' }, { value: 'nurse', label: 'Nurse app' }];
const SCENARIOS = [
  { id: 'visit_assigned', label: 'Nurse: new visit assigned' },
  { id: 'visit_cancelled', label: 'Nurse: visit cancelled' },
  { id: 'timesheet_approved', label: 'Nurse: timesheet approved' },
  { id: 'timesheet_sent_back', label: 'Nurse: timesheet sent back' },
  { id: 'safety_alert', label: 'Urgent safety alert (urgent channel)' },
  { id: 'mail', label: 'New mail' },
];
const LABEL: Record<string, string> = {
  sender: 'Sender switched on', service_account: 'Firebase key', project: 'Firebase project', channels: 'Notification channels',
  devices_admin: 'Admin app phones', devices_nurse: 'Nurse app phones', devices_unlabelled: 'Phones not yet labelled', nurse_profile: 'Nurse profile', mailbox: 'Mailbox membership',
  priority: 'Priority', ttl: 'Time to live', devices: 'Registered phones', deliveries: 'Recent deliveries', google_auth: 'Google accepts the key',
  user: 'Person', test_account: 'Test account', mailbox: 'Mailbox membership', history: 'Delivery history', sender_excluded: 'Sender is not notified',
};

function CheckList({ rows }: { rows: Check[] }) {
  return (
    <ul className={styles.checkList}>
      {rows.map((row) => (
        <li key={row.id} className={styles.checkItem}>
          <Badge tone={CHECK_TONE[row.status]}>{row.status}</Badge>
          <div><strong>{LABEL[row.id] ?? row.id}</strong><p>{row.detail}</p></div>
        </li>
      ))}
    </ul>
  );
}

/** Push notification diagnostics. Each action asks for the authenticator code in a pop-up; the server enforces it. */
export function PushDiagnosticsSection() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [explain, setExplain] = useState<Check[] | null>(null);
  const [person, setPerson] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [title, setTitle] = useState('Push test');
  const [body, setBody] = useState('If you can read this, push works.');
  const [critical, setCritical] = useState(false);
  const [app, setApp] = useState<App>('any');
  const [scenario, setScenario] = useState('visit_assigned');
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name); setError('');
    try { await fn(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'That check could not be completed.'); } finally { setBusy(''); }
  }

  const runChecks = () => act('checks', async () => setChecks((await apiClient.post<{ checks: Check[] }>(`${BASE}/run`, {})).checks));
  const googleAuth = () => act('google', async () => {
    const { check } = await apiClient.post<{ check: Check }>(`${BASE}/google-auth`, {});
    setChecks((current) => [...(current ?? []).filter((row) => row.id !== 'google_auth'), check]);
  });
  const loadDevices = () => act('devices', async () => setDevices((await apiClient.get<{ devices: Device[] }>(`${BASE}/devices?app=${app}${person ? `&user=${encodeURIComponent(person)}` : ''}`)).devices));
  const loadDeliveries = (status = '') => act('deliveries', async () => setDeliveries((await apiClient.get<{ deliveries: Delivery[] }>(`${BASE}/deliveries${status ? `?status=${status}` : ''}`)).deliveries));
  const runExplain = () => act('explain', async () => {
    const out = await apiClient.post<{ steps: Check[]; devices?: Device[] }>(`${BASE}/explain`, { user: person, app });
    setExplain(out.steps);
    if (out.devices) setDevices(out.devices);
  });
  const runScenario = async () => {
    if (!(await dialogs.confirm(`Send a "${SCENARIOS.find((item) => item.id === scenario)?.label}" test notification to ${person}? It is marked "Test:" and goes through the real delivery pipeline.`))) return;
    await act('scenario', async () => setScenarioResult(await apiClient.post<ScenarioResult>(`${BASE}/scenario`, { user: person, scenario })));
  };
  const runPipeline = async () => {
    if (!(await dialogs.confirm('Send a labelled test notification to your own phones through the real delivery pipeline?'))) return;
    await act('pipeline', async () => setPipeline(await apiClient.post<Pipeline>(`${BASE}/pipeline`, {})));
  };
  const send = async (device: Device, validateOnly: boolean) => {
    if (!validateOnly && !(await dialogs.confirm(`Send a real test notification to this ${device.platform} phone (${device.user_name ?? device.user_email ?? 'unknown'})?`))) return;
    await act('send', async () => setResult(await apiClient.post<SendResult>(`${BASE}/send`, { device_id: device.device_id, title, body, critical, validate_only: validateOnly })));
  };

  return (
    <section className={styles.panel} aria-label="Push notification diagnostics">
      <SectionHeader title="Push notification diagnostics" note="Every action asks for your authenticator code. Tokens are never shown in full." />
      {error ? <Notice tone="error"><p>{error}</p></Notice> : null}
      <div className={styles.actions} role="group" aria-label="Which app to test">
        {APPS.map((item) => (
          <button key={item.value} type="button" className={`${styles.pill} ${app === item.value ? styles.pillOn : ''}`} aria-pressed={app === item.value} onClick={() => { setApp(item.value); setDevices(null); setExplain(null); }}>{item.label}</button>
        ))}
      </div>
      {app === 'nurse' ? <Notice tone="info"><p>The nurse app only registers for push after the nurse turns on Visit reminders, allows notifications, and is on a build made with the nurse Firebase config. No phone row means one of those is missing.</p></Notice> : null}

      <div className={styles.block}>
        <h3>1. Setup</h3>
        <p className={styles.help}>Checks the server settings, Firebase key, registered phones and recent results. Sends nothing.</p>
        <div className={styles.actions}>
          <Button disabled={busy !== ''} onClick={() => void runChecks()}>{busy === 'checks' ? 'Checking…' : 'Run setup checks'}</Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void googleAuth()}>{busy === 'google' ? 'Contacting Google…' : 'Test Google login'}</Button>
        </div>
        {checks ? <CheckList rows={checks} /> : null}
      </div>

      <div className={styles.block}>
        <h3>2. Why did this person get nothing?</h3>
        <p className={styles.help}>Enter an e-mail address. It walks every gate a mail notification passes and shows their phones.</p>
        <label className={styles.field}>E-mail or user id
          <input value={person} onChange={(event) => setPerson(event.target.value)} autoComplete="off" />
        </label>
        <div className={styles.actions}>
          <Button disabled={!person.trim() || busy !== ''} onClick={() => void runExplain()}>{busy === 'explain' ? 'Checking…' : 'Explain'}</Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void loadDevices()}>{busy === 'devices' ? 'Loading…' : person.trim() ? 'Show their phones' : 'Show all phones'}</Button>
        </div>
        {explain ? <CheckList rows={explain} /> : null}
      </div>

      <div className={styles.block}>
        <h3>3. Send a test</h3>
        <div className={styles.fields}>
          <label className={styles.field}>Title<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className={styles.field}>Message<input value={body} maxLength={300} onChange={(event) => setBody(event.target.value)} /></label>
        </div>
        <label><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Send on the urgent channel</label>
        <p className={styles.help}>"Dry run" asks Google to validate the key, project and token without delivering anything. "Send" shows Google's exact answer. Close the app first, so Android shows the notification.</p>
        {devices === null ? <p className={styles.help}>Load phones in step 2 to pick one.</p> : devices.length === 0 ? <Notice tone="info"><p>No registered phones. Log in on the phone first.</p></Notice> : (
          <ul className={styles.checkList}>
            {devices.map((device) => (
              <li key={device.device_id} className={styles.row}>
                <p><strong>{device.user_name ?? 'Unknown'}</strong> · {device.app} app · {device.platform} {device.revoked_at ? '· revoked' : ''}</p>
                <p className={styles.mono}>{device.user_email} · token {device.has_token ? device.token_preview : 'missing'}{device.token_age_days !== null ? ` · ${device.token_age_days}d old` : ''}</p>
                <div className={styles.actions}>
                  <Button variant="outline" disabled={!device.has_token || busy !== ''} onClick={() => void send(device, true)}>Dry run</Button>
                  <Button disabled={!device.has_token || busy !== ''} onClick={() => void send(device, false)}>Send test</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {result ? (
          <Notice tone={result.ok ? 'success' : 'error'}>
            <p><strong>{result.ok ? (result.validate_only ? 'Google accepted the dry run.' : 'Google accepted the message.') : `Failed at ${result.stage}: ${result.error}`}</strong></p>
            {result.detail ? <p>{result.detail}</p> : null}
            {result.help ? <p>{result.help}</p> : null}
            {result.note ? <p>{result.note}</p> : null}
            {result.ok && !result.validate_only ? <p>If nothing appears on the phone, Google delivered it and the phone is hiding it (battery, channel or notification settings).</p> : null}
          </Notice>
        ) : null}
      </div>

      <div className={styles.block}>
        <h3>4. Real notification scenarios</h3>
        <p className={styles.help}>Sends the notifications people actually get (visit, timesheet, safety alert, mail) to the e-mail entered in step 2, through the real pipeline. Titles start with "Test:".</p>
        <label className={styles.field}>Scenario
          <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
            {SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <div className={styles.actions}><Button disabled={!person.trim() || busy !== ''} onClick={() => void runScenario()}>{busy === 'scenario' ? 'Sending…' : 'Send scenario'}</Button></div>
        {scenarioResult ? (
          <Notice tone={scenarioResult.ok ? 'success' : 'error'}>
            <p>{scenarioResult.to ? `To ${scenarioResult.to}. ` : ''}Sender mode: <strong>{scenarioResult.mode}</strong>. {scenarioResult.results.length} delivery attempt(s){scenarioResult.results.length ? `: ${scenarioResult.results.map((r) => r.status + (r.error ? ` (${r.error})` : '')).join(', ')}` : ''}.</p>
            {scenarioResult.results.filter((r) => r.help).map((r) => <p key={r.device_id}>{r.help}</p>)}
            {scenarioResult.note ? <p>{scenarioResult.note}</p> : null}
          </Notice>
        ) : null}
      </div>

      <div className={styles.block}>
        <h3>5. Full pipeline test</h3>
        <p className={styles.help}>Runs the real path used for new mail (inbox record, delivery record, Firebase) to your own phones.</p>
        <div className={styles.actions}><Button variant="outline" disabled={busy !== ''} onClick={() => void runPipeline()}>{busy === 'pipeline' ? 'Sending…' : 'Run pipeline test'}</Button></div>
        {pipeline ? (
          <Notice tone={pipeline.note ? 'info' : 'success'}>
            <p>Sender mode: <strong>{pipeline.mode}</strong>. {pipeline.results.length} delivery attempt(s){pipeline.results.length ? `: ${pipeline.results.map((r) => r.status).join(', ')}` : ''}.</p>
            {pipeline.note ? <p>{pipeline.note}</p> : null}
          </Notice>
        ) : null}
      </div>

      <div className={styles.block}>
        <h3>6. Recent deliveries</h3>
        <div className={styles.actions}>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void loadDeliveries()}>All</Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void loadDeliveries('failed')}>Failed</Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void loadDeliveries('pending')}>Pending</Button>
        </div>
        {deliveries ? (deliveries.length === 0 ? <Notice tone="info"><p>No deliveries match.</p></Notice> : (
          <ul className={styles.checkList}>
            {deliveries.map((row) => (
              <li key={row.id} className={styles.row}>
                <p><strong>{row.title}</strong> · {row.category} · {row.status} · {row.attempts} attempt(s)</p>
                <p className={styles.mono}>{row.created_at}{row.last_error ? ` · ${row.last_error}` : ''}</p>
                {row.help ? <p>{row.help}</p> : null}
              </li>
            ))}
          </ul>
        )) : null}
      </div>
    </section>
  );
}
