/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Checkbox } from '../../../components/ui/Checkbox';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { StatusBadge } from '../../../components/ui/Badge';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { SectionHeader } from '../../../components/admin/SectionHeader';

type Row = Record<string, any> & { id?: string };
type RosterEntry = { name: string; role: string; phone: string; days: string[]; start: string; end: string; override_phone: string; override_until: string };
const dt = (value: unknown) => { const d = new Date(String(value ?? '')); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };
const human = (v: unknown) => String(v ?? '—').replaceAll('_', ' ');
const listItems = (data: any): any[] => Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
const safeOutcome = (value: string) => value === 'safe' ? 'Staff confirmed safe' : value === 'referred' ? 'Escalated / referred' : value === 'closed_no_contact' ? 'Closed after no contact' : human(value);

export function SOSConsolePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['alerts:write']);
  const [rows, setRows] = useState<Row[]>([]);
  const [follow, setFollow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcome, setOutcome] = useState('safe');
  const [notes, setNotes] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiClient.get('/admin/care/sos');
      const items = listItems(result); setRows(items);
      if (id) {
        const selected = items.find((row: Row) => String(row.id) === id);
        if (!selected) { setError('SOS case was not found in the records you can access.'); setFollow(null); }
        else {
          try { setFollow(await apiClient.get(`/admin/care/sos/${encodeURIComponent(id)}/follow`)); }
          catch { setFollow(null); }
        }
      } else setFollow(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS cases could not be loaded.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => rows.find((row) => String(row.id) === String(id)), [rows, id]);

  async function acknowledge() {
    if (!id || !canWrite || saving) return;
    setSaving(true); setError('');
    try { await apiClient.post(`/admin/care/sos/${encodeURIComponent(id)}/acknowledge`, {}); setNotice('SOS case acknowledged and audit logged.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS case could not be acknowledged.'); }
    finally { setSaving(false); }
  }
  async function resolveCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!id || !canWrite || saving || notes.trim().length < 3) return;
    setSaving(true); setError('');
    try { await apiClient.post(`/admin/care/sos/${encodeURIComponent(id)}/resolve`, { outcome, notes: notes.trim() }); setNotice('SOS outcome and notes saved to the case and audit history.'); setOutcomeOpen(false); setNotes(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS case could not be resolved.'); }
    finally { setSaving(false); }
  }
  const isClosed = Boolean(selected && ['resolved', 'closed', 'cancelled'].includes(String(selected.status)));
  return <div className="stage-page">
    <PageHeader title={id ? 'SOS case detail' : 'SOS response console'} subtitle="Acknowledge, review recorded events, and record a response outcome. This console does not call emergency services on your behalf." actions={<ButtonGroup size="compact"><Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>{id && <Button variant="outline" onClick={() => navigate('/admin/care/sos')}>Back to console</Button>}</ButtonGroup>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {!id ? <section className="stage-panel"><h2>Current and recent SOS cases</h2>{rows.length === 0 && !loading ? <p className="stage-empty">No SOS cases are available within your permitted reach.</p> : <div className="stage-table-scroll"><table className="stage-table"><caption>SOS cases</caption><thead><tr><th>Raised</th><th>Nurse</th><th>Visit</th><th>Type</th><th>Status</th><th>Acknowledged</th><th>Outcome</th><th>Review</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td>{dt(row.created_at)}</td><td>{String(row.nurse_id ?? '—')}</td><td>{String(row.visit_id ?? '—')}</td><td>{row.test ? 'Test case' : 'SOS'}</td><td><StatusBadge status={String(row.status ?? '')}>{human(row.status)}</StatusBadge></td><td>{dt(row.acknowledged_at)}</td><td>{row.outcome ? safeOutcome(String(row.outcome)) : '—'}</td><td><Button variant="outline" onClick={() => navigate(`/admin/care/sos/${encodeURIComponent(String(row.id))}`)}>Open case</Button></td></tr>)}</tbody></table></div>}</section> : <>
      {selected && <div className="stage-summary-strip"><div><strong>{human(selected.status)}</strong><span>Current status</span></div><div><strong>{selected.test ? 'Yes' : 'No'}</strong><span>Test case</span></div><div><strong>{dt(selected.created_at)}</strong><span>Raised at</span></div><div><strong>{dt(selected.acknowledged_at)}</strong><span>Acknowledged at</span></div></div>}
      {selected && <section className="stage-panel"><div className="stage-detail-grid"><div><h2>Case details</h2><dl><dt>Case ID</dt><dd>{String(selected.id)}</dd><dt>Nurse ID</dt><dd>{String(selected.nurse_id ?? '—')}</dd><dt>Visit ID</dt><dd>{String(selected.visit_id ?? '—')}</dd><dt>Test case</dt><dd>{selected.test ? 'Yes' : 'No'}</dd><dt>Raised</dt><dd>{dt(selected.created_at)}</dd><dt>Acknowledged by</dt><dd>{String(selected.acknowledged_by ?? '—')}</dd><dt>Resolved</dt><dd>{dt(selected.resolved_at)}</dd><dt>Outcome</dt><dd>{selected.outcome ? safeOutcome(String(selected.outcome)) : 'Not recorded'}</dd></dl></div><div><h2>Response notes</h2><p>{String(selected.response_notes ?? 'No resolution notes have been recorded.')}</p><p className="stage-label-note">{selected.resolved_by ? `Recorded by ${selected.resolved_by}.` : 'Case remains in progress until an authorized responder records an outcome.'}</p>{canWrite && !isClosed && <ButtonGroup spaced>{selected.status !== 'acknowledged' && <Button onClick={() => void acknowledge()} disabled={saving}>Acknowledge case</Button>}<Button variant="outline" onClick={() => { setOutcome('safe'); setNotes(''); setOutcomeOpen(true); }} disabled={saving}>Record outcome</Button></ButtonGroup>}</div></div></section>}
      <section className="stage-panel"><h2>Recorded case events</h2>{Array.isArray(selected?.events) && selected.events.length ? <ol className="stage-event-list">{selected.events.map((event: Row, index: number) => <li key={`${event.type ?? 'event'}-${index}`}><strong>{human(event.type)}</strong><span>{dt(event.at)}</span>{event.outcome && <p>Outcome: {safeOutcome(String(event.outcome))}</p>}{event.notes && <p>{String(event.notes)}</p>}</li>)}</ol> : <p className="stage-empty">No case event history was returned.</p>}</section>
      <section className="stage-panel"><h2>Live-follow snapshots</h2>{follow?.active ? <><p>Live follow is active until {dt(follow.until)}. Only the latest bounded snapshots are displayed.</p>{Array.isArray(follow.snapshots) && follow.snapshots.length ? <div className="stage-table-scroll"><table className="stage-table"><thead><tr><th>Captured</th><th>Recorded</th><th>Coordinates</th><th>Accuracy</th></tr></thead><tbody>{follow.snapshots.map((point: Row) => <tr key={String(point.id)}><td>{dt(point.captured_at)}</td><td>{dt(point.recorded_at)}</td><td>{Number(point.lat).toFixed(5)}, {Number(point.lng).toFixed(5)}</td><td>{point.accuracy_m == null ? '—' : `${Number(point.accuracy_m)} m`}</td></tr>)}</tbody></table></div> : <p>No location snapshots are available.</p>}</> : <p className="stage-empty">Live follow is not active, not enabled, or has expired. This screen does not start location tracking.</p>}</section>
    </>}
    {outcomeOpen && <Modal id="stage-sos-outcome-title" title="Record SOS outcome" subtitle="This action closes the administrative case; it does not notify emergency services." onClose={() => setOutcomeOpen(false)}><form className="stage-form" onSubmit={(event) => void resolveCase(event)}><Field label="Outcome" kind="select" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="safe">Staff confirmed safe</option><option value="referred">Escalated / referred</option><option value="closed_no_contact">Closed after no contact</option></Field><Field label="Responder notes (required)" kind="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} requiredLabel="required" required minLength={3} maxLength={1000} /><ButtonGroup spaced><Button type="submit" disabled={saving || notes.trim().length < 3}>{saving ? 'Saving…' : 'Save outcome'}</Button><Button type="button" variant="outline" onClick={() => setOutcomeOpen(false)}>Cancel</Button></ButtonGroup></form></Modal>}
  </div>;
}

export function SOSHistoryPage() {
  const { user } = useAuth();
  const canCareRead = hasScopes(user, ['carecfg:read']);
  const canCareWrite = hasScopes(user, ['carecfg:write']);
  const [cases, setCases] = useState<Row[]>([]);
  const [drills, setDrills] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillOutcome, setDrillOutcome] = useState('passed');
  const [drillNotes, setDrillNotes] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const caseResult: any = await apiClient.get('/admin/care/sos'); setCases(listItems(caseResult));
      if (canCareRead) { const drillResult: any = await apiClient.get('/admin/care/sos/drills'); setDrills(listItems(drillResult)); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS history could not be loaded.'); }
    finally { setLoading(false); }
  }, [canCareRead]);
  useEffect(() => { void load(); }, [load]);
  async function testMessage() {
    if (!canCareWrite || busy) return;
    if (!window.confirm('Run the SOS test-message path to the configured test destination? With a live provider this can send a real SMS. It never creates a live SOS case.')) return;
    setBusy(true); setError(''); setNotice('');
    try { await apiClient.post('/admin/care/sos/test-sms', {}); setNotice('Test-message request completed. Review the notification log; this is not a delivery receipt.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Test message failed.'); }
    finally { setBusy(false); }
  }
  async function saveDrill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canCareWrite || busy || drillNotes.trim().length < 3) return;
    setBusy(true); setError('');
    try { await apiClient.post('/admin/care/sos/drills', { outcome: drillOutcome, notes: drillNotes.trim() }); setNotice('Drill result recorded in the audit history. No live SOS case was created.'); setDrillOpen(false); setDrillNotes(''); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Drill result could not be recorded.'); }
    finally { setBusy(false); }
  }
  return <div className="stage-page">
    <PageHeader title="SOS history & drills" subtitle="Review response history and record explicit test outcomes separately from real SOS cases." actions={<ButtonGroup size="compact"><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button>{canCareWrite && <Button onClick={() => setDrillOpen(true)}>Record drill</Button>}</ButtonGroup>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <section className="stage-panel"><SectionHeader title="SOS case history" note={<>{loading ? 'Loading…' : `${cases.length} cases within your permitted reach`}</>} actions={canCareWrite && <ButtonGroup><Button variant="outline" disabled={busy} onClick={() => void testMessage()}>Send test message</Button></ButtonGroup>} />
      {cases.length === 0 && !loading ? <p className="stage-empty">No SOS cases have been recorded in your permitted reach.</p> : <div className="stage-table-scroll"><table className="stage-table"><caption>SOS response history</caption><thead><tr><th>Raised</th><th>Case</th><th>Nurse</th><th>Status</th><th>Acknowledgement</th><th>Resolution</th><th>Outcome</th></tr></thead><tbody>{cases.map((row) => <tr key={String(row.id)}><td>{dt(row.created_at)}</td><td><Button variant="outline" href={`/admin/care/sos/${encodeURIComponent(String(row.id))}`}>{String(row.id)}</Button></td><td>{String(row.nurse_id ?? '—')}</td><td>{human(row.status)}</td><td>{dt(row.acknowledged_at)}</td><td>{dt(row.resolved_at)}</td><td>{row.outcome ? safeOutcome(String(row.outcome)) : 'Not recorded'}</td></tr>)}</tbody></table></div>}
    </section>
    {canCareRead && <section className="stage-panel"><h2>Recorded drills</h2><p className="stage-label-note">Manual drill entries are audit records. They do not themselves test the handset, verify an emergency responder, or create an SOS case.</p>{drills.length === 0 ? <p className="stage-empty">No drill results recorded.</p> : <div className="stage-table-scroll"><table className="stage-table"><caption>Drill history</caption><thead><tr><th>When</th><th>Outcome</th><th>Notes</th><th>Recorded by</th></tr></thead><tbody>{drills.map((row) => <tr key={String(row.id)}><td>{dt(row.at)}</td><td>{human(row.outcome)}</td><td>{String(row.notes ?? '—')}</td><td>{String(row.actor_id ?? 'Audit actor not available')}</td></tr>)}</tbody></table></div>}</section>}
    {drillOpen && <Modal id="stage-drill-title" title="Record SOS drill outcome" subtitle="Record only a drill that has already taken place. Use “Send test message” separately to test the configured SMS path." onClose={() => setDrillOpen(false)}><form className="stage-form" onSubmit={(event) => void saveDrill(event)}><Field label="Outcome" kind="select" value={drillOutcome} onChange={(event) => setDrillOutcome(event.target.value)}><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked / could not run</option></Field><Field label="Drill notes (required)" kind="textarea" value={drillNotes} onChange={(event) => setDrillNotes(event.target.value)} minLength={3} maxLength={1000} requiredLabel="required" required /><ButtonGroup spaced><Button type="submit" disabled={busy || drillNotes.trim().length < 3}>{busy ? 'Saving…' : 'Record result'}</Button><Button type="button" variant="outline" onClick={() => setDrillOpen(false)}>Cancel</Button></ButtonGroup></form></Modal>}
  </div>;
}

export function OnCallRosterPage() {
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['carecfg:write']);
  const canApprove = hasScopes(user, ['system:manage']);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: any = await apiClient.get('/admin/care/settings'); const items = listItems(result);
      const map = items.find((row) => row.id === 'sos.on_call_contacts')?.value;
      const roster = items.find((row) => row.id === 'sos.on_call_roster')?.value;
      const safeContacts = map && typeof map === 'object' && !Array.isArray(map) ? map as Record<string, string> : {};
      const safeRoster = roster && typeof roster === 'object' && !Array.isArray(roster) ? roster : {};
      setContacts(safeContacts);
      const storedEntries = Array.isArray((safeRoster as any).entries) ? (safeRoster as any).entries : [];
      if (storedEntries.length) {
        setEntries(storedEntries.map((item: any) => ({ name: String(item.name ?? ''), role: String(item.role ?? 'Responder'), phone: String(item.phone ?? ''), days: Array.isArray(item.days) ? item.days : [], start: String(item.start ?? '08:00'), end: String(item.end ?? '17:00'), override_phone: String(item.override_phone ?? ''), override_until: toLocalDateTimeInput(item.override_until) })));
      } else {
        setEntries(Object.entries(safeContacts).map(([name, phone]) => ({ name, role: 'Responder', phone: String(phone ?? ''), days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '00:00', end: '23:59', override_phone: '', override_until: '' })));
      }
      setEnabled(Boolean((safeRoster as any).enabled)); setApproved(Boolean((safeRoster as any).approved));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'On-call roster could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const configuredContacts = useMemo(() => Object.keys(contacts).length, [contacts]);
  const rosterEditAllowed = canWrite && (canApprove || (!enabled && !approved));
  function updateEntry(index: number, patch: Partial<RosterEntry>) { setEntries((old) => old.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || saving || !rosterEditAllowed) return;
    if (entries.some((entry) => !entry.name.trim() || !entry.phone.trim() || entry.days.length === 0 || !entry.start || !entry.end)) { setError('Every roster entry needs a name, primary phone, at least one day, and start/end hours.'); return; }
    if (enabled && !canApprove) { setError('Only system:manage users can activate scheduled routing. Save contacts and draft shifts with the schedule disabled.'); return; }
    setSaving(true); setError(''); setNotice('');
    const normalised = entries.map((entry) => ({ ...entry, name: entry.name.trim(), phone: entry.phone.trim(), override_phone: entry.override_phone.trim(), override_until: entry.override_until ? new Date(entry.override_until).toISOString() : '' }));
    const contactMap = Object.fromEntries(normalised.filter((entry) => entry.name && entry.phone).map((entry) => [entry.name, entry.phone]));
    const roster = { enabled, approved: enabled && approved && canApprove, entries: normalised };
    try {
      await apiClient.put('/admin/care/settings/sos.on_call_contacts', { value: contactMap });
      await apiClient.put('/admin/care/settings/sos.on_call_roster', { value: roster });
      setNotice('Roster and fallback contacts saved and audited. Until scheduled routing is both enabled and approved, all legacy configured contacts remain recipients.');
      await load();
    } catch (reason) { setError((reason instanceof Error ? reason.message : 'Roster could not be saved.') + ' Because the two settings are stored separately, refresh and verify both the contact list and schedule before relying on this change.'); }
    finally { setSaving(false); }
  }
  return <div className="stage-page">
    <PageHeader title="On-call roster" subtitle="Maintain fallback responder contacts and optional time-based coverage. Keep the emergency procedure reviewed and approved separately." actions={<Button variant="outline" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <div className="stage-callout"><strong>Routing safety</strong><p>{enabled && approved ? 'Scheduled routing is enabled. If no scheduled entry matches the current time, the dispatcher fails safe to all configured legacy contacts.' : 'Scheduled routing is not both enabled and approved. All configured contact numbers remain the fallback recipients for SOS and critical-care SMS.'} Verify phone numbers and shift coverage before enabling this schedule. These settings do not replace calling local emergency services.</p></div>
    <div className="stage-summary-strip"><div><strong>{configuredContacts}</strong><span>Legacy fallback contacts saved</span></div><div><strong>{entries.length}</strong><span>Roster entries</span></div><div><strong>{enabled ? 'Enabled' : 'Disabled'}</strong><span>Scheduled routing</span></div><div><strong>{approved ? 'Approved' : 'Not approved'}</strong><span>Activation approval</span></div></div>
    <form className="stage-panel stage-form" onSubmit={(event) => void save(event)}>
      <SectionHeader title="Responder schedule" note={<>Days use short English names: mon, tue, wed, thu, fri, sat, sun. Shift hours are evaluated in the server's configured timezone.</>} actions={<ButtonGroup><Button type="button" variant="outline" onClick={() => setEntries((old) => [...old, { name: '', role: 'Responder', phone: '', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '17:00', override_phone: '', override_until: '' }])} disabled={!rosterEditAllowed}>Add entry</Button></ButtonGroup>} />
      {loading ? <p>Loading roster…</p> : entries.length === 0 ? <p className="stage-empty">No roster entries configured. Add at least one validated contact before use.</p> : entries.map((entry, index) => <section className="stage-panel" key={`${index}-${entry.name}`}><div className="stage-toolbar"><h3>Responder {index + 1}</h3><Button type="button" variant="outline" disabled={!rosterEditAllowed} onClick={() => setEntries((old) => old.filter((_, i) => i !== index))}>Remove</Button></div><div className="stage-settings-grid"><Field label="Name / identifier" value={entry.name} onChange={(event) => updateEntry(index, { name: event.target.value })} disabled={!rosterEditAllowed} requiredLabel="required" required /><Field label="Role" value={entry.role} onChange={(event) => updateEntry(index, { role: event.target.value })} disabled={!rosterEditAllowed} /><Field label="Primary phone (keep + country code)" value={entry.phone} onChange={(event) => updateEntry(index, { phone: event.target.value })} disabled={!rosterEditAllowed} requiredLabel="required" required /><Field label="Days (comma-separated)" value={entry.days.join(', ')} onChange={(event) => updateEntry(index, { days: event.target.value.split(',').map((day) => day.trim().toLowerCase()).filter(Boolean) })} disabled={!rosterEditAllowed} placeholder="mon, tue, wed" /><Field label="Shift start" type="time" value={entry.start} onChange={(event) => updateEntry(index, { start: event.target.value })} disabled={!rosterEditAllowed} requiredLabel="required" required /><Field label="Shift end" type="time" value={entry.end} onChange={(event) => updateEntry(index, { end: event.target.value })} disabled={!rosterEditAllowed} requiredLabel="required" required /><Field label="Temporary override phone" value={entry.override_phone} onChange={(event) => updateEntry(index, { override_phone: event.target.value })} disabled={!rosterEditAllowed} /><Field label="Override expiry (your browser's local time)" type="datetime-local" value={entry.override_until} onChange={(event) => updateEntry(index, { override_until: event.target.value })} disabled={!rosterEditAllowed} /></div></section>)}
      <Checkbox label="Enable scheduled routing (requires system:manage)" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={!canApprove} />
      <Checkbox label="Mark schedule approved (confirm that coverage was reviewed)" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={!canApprove} />
      {!canApprove && <p className="stage-label-note">Only users with system:manage may activate, approve, or change an active/approved schedule. Care configuration editors may edit a schedule while it remains disabled and unapproved.</p>}
      <ButtonGroup spaced><Button type="submit" disabled={saving || !canWrite || !rosterEditAllowed}>{saving ? 'Saving…' : 'Save roster'}</Button><Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving}>Discard unsaved changes</Button></ButtonGroup>
    </form>
  </div>;
}

const procedureDefaults = {
  version: '', owner: '', approvedBy: '', approvalDate: '', responseTarget: '', responderSteps: '', emergencyEscalation: '', reportDeadline: '', drillFrequency: '', verifiedContacts: '',
};
function parseProcedure(text: string) {
  const take = (label: string) => text.match(new RegExp(`^${label}:\\s*(.*)$`, 'mi'))?.[1]?.trim() ?? '';
  const section = (label: string, next: string) => text.match(new RegExp(`${label}:\\s*\\n([\\s\\S]*?)\\n${next}:`, 'i'))?.[1]?.trim() ?? '';
  return {
    version: take('Version'), owner: take('Owner'), approvedBy: take('Approved by'), approvalDate: take('Approval date'), responseTarget: take('Response target'),
    responderSteps: section('Responder steps', 'Emergency escalation'), emergencyEscalation: section('Emergency escalation', 'Incident report deadline'),
    reportDeadline: take('Incident report deadline'), drillFrequency: take('Drill frequency'), verifiedContacts: take('Verified contacts'),
  };
}
function buildProcedure(form: typeof procedureDefaults, approved: boolean) {
  return [
    '# SOS response procedure', `Version: ${form.version.trim() || '[REQUIRED]'}`, `Owner: ${form.owner.trim() || '[REQUIRED]'}`,
    `Approved by: ${approved ? form.approvedBy.trim() : '[NOT APPROVED]'}`, `Approval date: ${approved ? form.approvalDate.trim() : '[NOT APPROVED]'}`,
    `Response target: ${form.responseTarget.trim() || '[REQUIRED]'}`, 'Responder steps:', form.responderSteps.trim() || '[REQUIRED]',
    'Emergency escalation:', form.emergencyEscalation.trim() || '[REQUIRED]', `Incident report deadline: ${form.reportDeadline.trim() || '[REQUIRED]'}`,
    `Drill frequency: ${form.drillFrequency.trim() || '[REQUIRED]'}`, `Verified contacts: ${form.verifiedContacts.trim() || '[REQUIRED]'}`,
    `Status: ${approved ? 'APPROVED BY DESIGNATED OWNER — confirm external go-live checklist separately' : 'NOT APPROVED FOR LIVE USE'}`,
    '', 'This application does not contact emergency services on behalf of the organisation. Call the applicable local emergency service when required.',
  ].join('\n');
}

export function SOSProcedurePage() {
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['carecfg:write']);
  const canApprove = hasScopes(user, ['system:manage']);
  const [form, setForm] = useState(procedureDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentlyApproved, setCurrentlyApproved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data: any = await apiClient.get('/admin/care/settings'); const current = listItems(data).find((row) => row.id === 'sos.procedure')?.value;
      const text = String(current ?? ''); const parsed = text ? { ...procedureDefaults, ...parseProcedure(text) } : { ...procedureDefaults };
      setForm(parsed); setCurrentlyApproved(text.includes('Status: APPROVED BY DESIGNATED OWNER'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS procedure could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const requiredComplete = [form.version, form.owner, form.responseTarget, form.responderSteps, form.emergencyEscalation, form.reportDeadline, form.drillFrequency, form.verifiedContacts].every((value) => value.trim().length >= 3);
  async function save(approve: boolean, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!canWrite || saving) return;
    if (approve && (!canApprove || !requiredComplete || !form.approvedBy.trim() || !form.approvalDate.trim())) { setError('Approval requires system:manage, all required procedure sections, an approver, and an approval date.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const text = buildProcedure(form, approve);
      await apiClient.put('/admin/care/settings/sos.procedure', { value: text });
      setCurrentlyApproved(approve); setNotice(approve ? 'Procedure approval text saved and audited. Complete the organisation’s separate readiness/go-live checklist before relying on SOS.' : 'Draft procedure saved and audited; it remains marked not approved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SOS procedure could not be saved.'); }
    finally { setSaving(false); }
  }
  function update<K extends keyof typeof procedureDefaults>(key: K, value: string) { setForm((old) => ({ ...old, [key]: value })); }
  return <div className="stage-page">
    <PageHeader title="SOS procedure" subtitle="Maintain the written responder procedure and review history. This screen never replaces emergency-service calls or the deployment go-live checklist." actions={<Button variant="outline" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <div className="stage-callout"><strong>{currentlyApproved ? 'Approval text recorded' : 'Not approved for live use'}</strong><p>Approval text alone does not mean the entire system is ready. Verify emergency numbers, responsibilities, response times, contact availability, test delivery, retention, and organisational sign-off outside this screen.</p></div>
    <form className="stage-panel stage-form" onSubmit={(event) => void save(false, event)}>
      {loading ? <p>Loading procedure…</p> : <>
        <h2>Procedure details</h2><div className="stage-settings-grid"><Field label="Version" value={form.version} onChange={(event) => update('version', event.target.value)} disabled={!canWrite} requiredLabel="required" required /><Field label="Procedure owner" value={form.owner} onChange={(event) => update('owner', event.target.value)} disabled={!canWrite} requiredLabel="required" required /><Field label="Response time target" value={form.responseTarget} onChange={(event) => update('responseTarget', event.target.value)} disabled={!canWrite} placeholder="Specify a target approved by the organisation" requiredLabel="required" required /><Field label="Incident report deadline" value={form.reportDeadline} onChange={(event) => update('reportDeadline', event.target.value)} disabled={!canWrite} placeholder="Specify the required reporting window" requiredLabel="required" required /><Field label="Drill frequency" value={form.drillFrequency} onChange={(event) => update('drillFrequency', event.target.value)} disabled={!canWrite} placeholder="e.g. monthly; define owner" requiredLabel="required" required /><Field label="Verified contacts and last check date" value={form.verifiedContacts} onChange={(event) => update('verifiedContacts', event.target.value)} disabled={!canWrite} placeholder="List roles and verification date; do not put secrets here" requiredLabel="required" required /><Field label="Approval date" type="date" value={form.approvalDate} onChange={(event) => update('approvalDate', event.target.value)} disabled={!canApprove} /><Field label="Approved by (designated owner)" value={form.approvedBy} onChange={(event) => update('approvedBy', event.target.value)} disabled={!canApprove} /></div>
        <Field label="Responder steps" kind="textarea" value={form.responderSteps} onChange={(event) => update('responderSteps', event.target.value)} disabled={!canWrite} requiredLabel="required" required maxLength={8000} />
        <Field label="Emergency escalation (including when to call local emergency services)" kind="textarea" value={form.emergencyEscalation} onChange={(event) => update('emergencyEscalation', event.target.value)} disabled={!canWrite} requiredLabel="required" required maxLength={8000} />
        <p className="stage-label-note">Required procedure content complete: {requiredComplete ? 'yes' : 'no'}. Only a user with system:manage can mark this procedure approved. Empty/placeholder sections keep it marked not approved.</p>
        <ButtonGroup spaced><Button type="submit" disabled={saving || !canWrite}>{saving ? 'Saving…' : 'Save draft'}</Button>{canApprove && <Button type="button" disabled={saving || !canWrite || !requiredComplete || !form.approvedBy.trim() || !form.approvalDate.trim()} onClick={() => void save(true)}>Mark approved</Button>}<Button type="button" variant="outline" onClick={() => window.print()}>Print procedure</Button></ButtonGroup>
      </>}
    </form>
  </div>;
}

function toLocalDateTimeInput(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
