import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@shared/components/ui/Button';
import { Notice } from '@shared/components/dialogs/Notice';
import { apiClient } from '@shared/lib/api/client';
import { cx } from '@shared/lib/cx';
import styles from './Diagnostics.module.css';

export type TestClientVisit = {
  id: string; start: string | null; end: string | null; status: string;
  checked_in: string | null; checked_out: string | null; adhoc: boolean; safety: string | null;
};
export type TestClientStatus = {
  enabled: boolean; present: boolean; day_offset: number; world_date: string; today: string; scenario: string;
  patient_types: string[]; visit_states: string[]; scenarios: Record<string, { label: string; about: string }>;
  max_step_days: number;
  client: { id: string; name: string; patient_type: string } | null;
  place: { lat: number; lng: number; radius_m: number; address: string | null } | null;
  visits: TestClientVisit[];
};
type Checks = { alerts_created?: number; timesheets_created?: number };
type Result = Partial<TestClientStatus> & { checks?: Checks };

const BASE = '/admin/test-accounts/client';

function when(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { timeZone: 'Africa/Kampala', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Test client and day controls (superadmin, inside Test accounts). The client is a real client of the test nurse.
 * Skipping days moves the test nurse's data, not the clock, so check-in, sync and the scheduler stay on real time.
 * `status` comes from the Test accounts listing; every action returns the fresh status, so we show that.
 */
export function TestClientPanel({ status, onChanged }: { status: TestClientStatus; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const [step, setStep] = useState(1);
  const [type, setType] = useState('');
  const [scenario, setScenario] = useState('');
  const [place, setPlace] = useState<{ lat: string; lng: string; radius: string }>({ lat: '', lng: '', radius: '150' });
  const s = status;

  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; note?: string }) => apiClient.post<Result>(`${BASE}${path}`, body ?? {}),
    onSuccess: (result, vars) => {
      const c = result.checks;
      const checkNote = c && (c.alerts_created !== undefined || c.timesheets_created !== undefined)
        ? ` Checks ran: ${c.alerts_created ?? 0} alerts, ${c.timesheets_created ?? 0} timesheets.` : '';
      setMessage(`${vars.note ?? 'Done.'}${checkNote}`);
      onChanged();
    },
  });
  const days = (n: number) => run.mutate({ path: '/days', body: { days: n }, note: n > 0 ? `Moved on ${n} day${n === 1 ? '' : 's'}.` : `Moved back ${-n} day${n === -1 ? '' : 's'}.` });
  const patientType = type || s.client?.patient_type || s.patient_types[0] || 'General';
  const scenarioName = scenario || s.scenario;
  const off = s.day_offset;

  return (
    <div className={styles.block}>
      <h3>Test client and days</h3>
      <p className={styles.help}>
        A test client for the test nurse. Skip days to walk through visits, late alerts and timesheets without waiting.
        This moves the test nurse's data, not the clock, so check-in and sync still run on real time.
      </p>
      {run.isError ? <Notice tone="error"><p>{run.error instanceof Error ? run.error.message : 'That did not work.'}</p></Notice> : null}
      {message ? <Notice tone="info"><p>{message}</p></Notice> : null}
      <div className={styles.status}>
        <span className={styles.statusLabel}>Test client</span>
        <span className={cx(styles.pill, s.enabled && styles.pillOn)}>{s.enabled ? 'On' : 'Off'}</span>
        <Button size="compact" variant={s.enabled ? 'outline' : 'primary'} disabled={run.isPending}
          onClick={() => (s.enabled ? run.mutate({ path: '/disable', note: 'Test client switched off and deleted.' }) : run.mutate({ path: '/enable', body: { patient_type: patientType }, note: 'Test client switched on.' }))}>
          {s.enabled ? 'Switch off and delete' : 'Switch on'}
        </Button>
      </div>
      {s.enabled && !s.present ? <Notice tone="info"><p>The client appears once both test accounts are on.</p></Notice> : null}
      {s.enabled && s.present ? (
        <>
          <p className={styles.accountMeta}>{s.client?.name} · {s.client?.patient_type}{s.place?.address ? ` · ${s.place.address}` : ''}</p>
          <div className={styles.status}>
            <span className={styles.statusLabel}>Test world date</span>
            <span className={cx(styles.pill, off !== 0 && styles.pillOn)}>{s.world_date}</span>
            <span className={styles.help}>{off === 0 ? `Real today (${s.today}).` : `${off > 0 ? '+' : ''}${off} day${Math.abs(off) === 1 ? '' : 's'} from real today (${s.today}).`}</span>
          </div>
          <div className={styles.actions}>
            <Button size="compact" disabled={run.isPending} onClick={() => days(1)}>Next day</Button>
            <Button size="compact" variant="outline" disabled={run.isPending} onClick={() => days(-1)}>Previous day</Button>
            <label className={styles.field}>Days to move
              <input type="number" aria-label="Days to move" min={1} max={s.max_step_days} value={step}
                onChange={(e) => setStep(Math.max(1, Math.min(s.max_step_days, Number(e.target.value) || 1)))} />
            </label>
            <Button size="compact" variant="outline" disabled={run.isPending} onClick={() => days(step)}>Skip forward</Button>
            <Button size="compact" variant="outline" disabled={run.isPending} onClick={() => days(-step)}>Skip back</Button>
            <Button size="compact" variant="outline" disabled={run.isPending || off === 0} onClick={() => run.mutate({ path: '/days', body: { back_to_today: true }, note: 'Back to today.' })}>Back to today</Button>
          </div>
          <div className={styles.actions}>
            <Button size="compact" variant="outline" disabled={run.isPending} onClick={() => run.mutate({ path: '/checks', note: 'Checks ran.' })}>Run alert and timesheet checks now</Button>
          </div>
          <div className={styles.fields}>
            <label className={styles.field}>Scenario
              <select value={scenarioName} onChange={(e) => setScenario(e.target.value)}>
                {Object.entries(s.scenarios).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <p className={styles.help}>{s.scenarios[scenarioName]?.about}</p>
            <div className={styles.actions}>
              <Button size="compact" variant="outline" disabled={run.isPending} onClick={() => run.mutate({ path: '/scenario', body: { name: scenarioName }, note: 'Scenario applied. The days are back to today.' })}>Apply scenario</Button>
            </div>
            <label className={styles.field}>Patient type
              <select value={patientType} onChange={(e) => { setType(e.target.value); run.mutate({ path: '/type', body: { patient_type: e.target.value }, note: 'Patient type changed.' }); }}>
                {s.patient_types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <fieldset className={styles.block}>
            <legend><strong>Client home (for check-in checks)</strong></legend>
            <p className={styles.help}>{s.place ? `Now ${s.place.lat.toFixed(5)}, ${s.place.lng.toFixed(5)}, radius ${s.place.radius_m} m.` : 'Not set.'} Put it where you are testing from so check-ins read as verified.</p>
            <div className={styles.fields}>
              <label className={styles.field}>Latitude<input inputMode="decimal" value={place.lat} onChange={(e) => setPlace({ ...place, lat: e.target.value })} placeholder="0.3476" /></label>
              <label className={styles.field}>Longitude<input inputMode="decimal" value={place.lng} onChange={(e) => setPlace({ ...place, lng: e.target.value })} placeholder="32.5825" /></label>
              <label className={styles.field}>Radius in metres (50 to 1000)<input inputMode="numeric" value={place.radius} onChange={(e) => setPlace({ ...place, radius: e.target.value })} /></label>
            </div>
            <div className={styles.actions}>
              <Button size="compact" variant="outline" disabled={run.isPending || !place.lat || !place.lng}
                onClick={() => run.mutate({ path: '/location', body: { lat: Number(place.lat), lng: Number(place.lng), radius_m: Number(place.radius) || 150 }, note: 'Client home saved.' })}>Save home</Button>
            </div>
          </fieldset>
          <div className={styles.block}>
            <h3>Visits ({s.visits.length})</h3>
            {s.visits.length === 0 ? <p className={styles.help}>No visits. Apply a scenario.</p> : (
              <ul className={styles.accounts}>
                {s.visits.map((v) => (
                  <li key={v.id} className={styles.account}>
                    <p className={styles.accountName}>{when(v.start)} to {when(v.end)} <span className={cx(styles.pill, v.status === 'completed' && styles.pillOn)}>{v.status}</span></p>
                    <p className={styles.accountMeta}>In: {when(v.checked_in)} · Out: {when(v.checked_out)}{v.safety ? ` · safety: ${v.safety}` : ''}{v.adhoc ? ' · ad hoc' : ''}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              {[['Add one due in 10 min', { day: 0, at: '', minutes: true }], ['Add tomorrow 09:00', { day: 1, at: '09:00' }], ['Add yesterday, completed', { day: -1, at: '09:00', state: 'completed' }]].map(([label, body]) => (
                <Button key={String(label)} size="compact" variant="outline" disabled={run.isPending}
                  onClick={() => {
                    const b = body as { day: number; at: string; state?: string; minutes?: boolean };
                    const at = b.minutes ? new Date(Date.now() + 10 * 60000).toLocaleTimeString('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit' }) : b.at;
                    run.mutate({ path: '/visits', body: { day: b.day, at, length: 60, state: b.state ?? 'scheduled' }, note: 'Visit added.' });
                  }}>{String(label)}</Button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
