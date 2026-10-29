import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import { ApiError, apiClient } from '../../../../lib/api/client';
import { hasScopes } from '../../auth/hasScopes';
import { useAuth } from '../../auth/useAuth';
import '../care.css';
import './nurse-detail.css';

type NurseDetails = {
  person: { name?: string | null; email?: string | null; phone_e164?: string | null; is_active?: boolean };
  profile: {
    user_id: string; staff_number: string; supervisor_id?: string | null; team_id?: string | null;
    active: boolean; phone_e164?: string | null; last_seen_at?: string | null; app_version?: string | null;
    battery_pct?: number | null; adhoc_override?: boolean | null; consent_versions?: Record<string, string>;
  };
  devices: Array<{ device_id: string; platform: string; registered_at: string; revoked_at?: string | null; push_token_updated_at?: string | null; has_push_token: boolean }>;
  consents: Array<{ type: string; version: string; source: string; accepted_at: string }>;
};

function dateTime(value?: string | null): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export function NurseDetailPage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWriteNurse = hasScopes(user, ['nurses:write']);
  const canWriteCareSettings = hasScopes(user, ['carecfg:write']);
  const [details, setDetails] = useState<NurseDetails | null>(null);
  const [supervisorId, setSupervisorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    try {
      const result = await apiClient.get<NurseDetails>(`/admin/care/nurses/${encodeURIComponent(userId)}/details`);
      setDetails(result);
      setSupervisorId(result.profile.supervisor_id ?? '');
    } catch (reason) {
      setDetails(null);
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'Nurse details could not be loaded.');
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  }

  async function saveSupervisor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(
      () => apiClient.patch(`/admin/care/nurses/${encodeURIComponent(userId)}/supervisor`, { supervisor_id: supervisorId.trim() || null }),
      'Supervisor assignment saved and audited.',
    );
  }

  if (loading) return <section className="admin-page"><p role="status">Loading nurse details…</p></section>;
  if (!details) return <section className="admin-page"><p role="alert">{error || 'Nurse not found.'}</p><Button variant="outline" onClick={() => navigate('/admin/care/nurses')}>Back to nurses</Button></section>;

  const nurse = details.profile;
  return (
    <section className="admin-page nurse-detail" aria-labelledby="nurse-detail-title">
      <header className="page-header">
        <div><p className="eyebrow">Nurse profile</p><h1 id="nurse-detail-title">{details.person.name ?? nurse.staff_number}</h1><p>{nurse.staff_number} · {details.person.email ?? 'No email recorded'}</p></div>
        <div className="nurse-header-actions"><Button variant="outline" onClick={() => navigate('/admin/care/nurses')}>Back to nurses</Button>{canWriteNurse && <Button type="button" disabled={busy} onClick={() => void runAction(() => apiClient.post(`/admin/care/nurses/${encodeURIComponent(userId)}/invite`, {}), 'Invitation resent.')}>Resend invite</Button>}</div>
      </header>
      {error && <p className="care-error" role="alert">{error}</p>}
      {notice && <p className="care-notice" role="status">{notice}</p>}

      <section className="nurse-detail-grid">
        <article className="care-form">
          <h2>Account and assignment</h2>
          <dl className="nurse-facts">
            <div><dt>Account</dt><dd>{details.person.is_active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt>Nurse profile</dt><dd>{nurse.active ? 'Active' : 'Inactive'}</dd></div>
            <div><dt>Phone</dt><dd>{details.person.phone_e164 ?? nurse.phone_e164 ?? 'Not recorded'}</dd></div>
            <div><dt>Team</dt><dd>{nurse.team_id ?? 'Not assigned'}</dd></div>
            <div><dt>Last seen</dt><dd>{dateTime(nurse.last_seen_at)}</dd></div>
            <div><dt>App version</dt><dd>{nurse.app_version ?? 'Not reported'}</dd></div>
            <div><dt>Battery</dt><dd>{nurse.battery_pct == null ? 'Not reported' : `${nurse.battery_pct}%`}</dd></div>
          </dl>
          {canWriteNurse && <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction(() => apiClient.patch(`/admin/care/nurses/${encodeURIComponent(userId)}`, { active: !nurse.active }), nurse.active ? 'Nurse profile deactivated.' : 'Nurse profile activated.')}>{nurse.active ? 'Deactivate nurse' : 'Activate nurse'}</Button>}
          {canWriteNurse && <form className="care-form nurse-supervisor-form" onSubmit={saveSupervisor}>
            <h3>Supervisor assignment</h3>
            <Field label="Supervisor user ID" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} maxLength={160} />
            <p>Use the account ID of an active supervisor. Leave blank only when your operational policy allows an unassigned nurse.</p>
            <Button type="submit" disabled={busy}>Save supervisor</Button>
          </form>}
        </article>

        <article className="care-form">
          <h2>Unscheduled visit override</h2>
          <p>Current setting: <strong>{nurse.adhoc_override == null ? 'Use organisation setting' : nurse.adhoc_override ? 'Allowed for this nurse' : 'Blocked for this nurse'}</strong></p>
          {canWriteCareSettings ? <div className="nurse-override-actions">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction(() => apiClient.patch(`/admin/care/nurses/${encodeURIComponent(userId)}/adhoc-override`, { enabled: true }), 'Unscheduled visits enabled for this nurse.')}>Allow</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction(() => apiClient.patch(`/admin/care/nurses/${encodeURIComponent(userId)}/adhoc-override`, { enabled: false }), 'Unscheduled visits blocked for this nurse.')}>Block</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction(() => apiClient.patch(`/admin/care/nurses/${encodeURIComponent(userId)}/adhoc-override`, { enabled: null }), 'Nurse now follows the organisation setting.')}>Use organisation setting</Button>
          </div> : <p>Editing this override requires carecfg:write.</p>}
        </article>
      </section>

      <section className="care-form">
        <h2>Registered devices</h2>
        <p>Push-token values are never displayed or returned by the detail endpoint.</p>
        {details.devices.length === 0 ? <p>No registered devices.</p> : <div className="nurse-device-list">{details.devices.map((device) => <article className="nurse-device" key={device.device_id}>
          <div><strong>{device.platform}</strong><p>{device.device_id}</p><small>Registered {dateTime(device.registered_at)} · token {device.has_push_token ? 'present' : 'missing'}</small></div>
          <span className={`nurse-device-state${device.revoked_at ? ' is-revoked' : ''}`}>{device.revoked_at ? `Revoked ${dateTime(device.revoked_at)}` : 'Active'}</span>
          {canWriteNurse && !device.revoked_at && <Button variant="outline" disabled={busy} onClick={() => { const accepted = window.confirm(`Revoke device ${device.device_id}?`); if (accepted) void runAction(() => apiClient.post(`/admin/care/nurses/${encodeURIComponent(userId)}/revoke-device`, { device_id: device.device_id }), 'Device revoked.'); }}>Revoke</Button>}
        </article>)}</div>}
      </section>

      <section className="care-form">
        <h2>Consent records</h2>
        {details.consents.length === 0 ? <p>No consent records are recorded.</p> : <div className="nurse-consent-list">{details.consents.map((consent, index) => <article className="nurse-consent" key={`${consent.type}:${consent.version}:${consent.accepted_at}:${index}`}><div><strong>{consent.type.replaceAll('_', ' ')}</strong><p>Version {consent.version} · Source {consent.source}</p></div><time>{dateTime(consent.accepted_at)}</time></article>)}</div>}
      </section>
    </section>
  );
}
