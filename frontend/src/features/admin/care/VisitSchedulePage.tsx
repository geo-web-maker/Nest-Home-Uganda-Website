/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/PageHeader';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { ApiError, apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { StatusBadge } from '../../../components/ui/Badge';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';

type Visit = Record<string, any> & {
  id: string;
  client_id: string;
  nurse_id: string;
  place_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
};
type Choice = Record<string, any> & { id?: string; user_id?: string; display_name?: string; staff_number?: string };
type VisitView = 'day' | 'week';

const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const dateFromKey = (value: string) => {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};
const startOfDateKey = (value: string) => {
  const date = dateFromKey(value);
  date.setHours(0, 0, 0, 0);
  return date;
};
const startOfWeek = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
};
const isoLocal = (value: string) => new Date(value).toISOString();
const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not recorded' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
};
const displayDate = (value: string) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateFromKey(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};
const displayName = (rows: Choice[], id: unknown, key: 'nurse' | 'client') => {
  const row = rows.find((item) => String(key === 'nurse' ? item.user_id ?? item.id : item.id) === String(id));
  return row ? String(row.display_name ?? row.name ?? row.staff_number ?? id) : String(id ?? '—');
};
const newRecordId = () => `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function VisitSchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = hasScopes(user, ['visits:write']);
  const canReadClients = hasScopes(user, ['clients:read']);
  const canReadNurses = hasScopes(user, ['nurses:read']);
  const canCreate = canWrite && canReadClients && hasScopes(user, ['places:read']) && canReadNurses;
  const canReassign = canReadClients && canReadNurses;
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clients, setClients] = useState<Choice[]>([]);
  const [nurses, setNurses] = useState<Choice[]>([]);
  const [view, setView] = useState<VisitView>('day');
  const [anchor, setAnchor] = useState(dateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [actionVisit, setActionVisit] = useState<Visit | null>(null);
  const [clientId, setClientId] = useState('');
  const [nurseId, setNurseId] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [places, setPlaces] = useState<Choice[]>([]);
  const [currentStayId, setCurrentStayId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [instructions, setInstructions] = useState('');
  const [replacementNurseId, setReplacementNurseId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, clientResult, nurseResult] = await Promise.all([
        apiClient.get<any>('/admin/care/visits', { params: { page: 1, page_size: 200 } }),
        canReadClients ? apiClient.get<any>('/admin/care/clients').catch(() => null) : Promise.resolve(null),
        canReadNurses ? apiClient.get<any>('/admin/care/nurses').catch(() => null) : Promise.resolve(null),
      ]);
      setVisits(Array.isArray(result) ? result : result.items ?? []);
      setClients(clientResult ? (Array.isArray(clientResult) ? clientResult : clientResult.items ?? []) : []);
      setNurses(nurseResult ? (Array.isArray(nurseResult) ? nurseResult : nurseResult.items ?? []) : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Schedule could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [canReadClients, canReadNurses]);

  useEffect(() => { void loadVisits(); }, [loadVisits]);

  const range = useMemo(() => {
    const selected = dateFromKey(anchor);
    const from = view === 'week' ? startOfWeek(selected) : selected;
    const to = new Date(from);
    to.setDate(to.getDate() + (view === 'week' ? 7 : 1));
    return { from: dateKey(from), to: dateKey(to), label: view === 'day' ? displayDate(anchor) : `${displayDate(dateKey(from))} – ${displayDate(dateKey(new Date(to.getTime() - 86400000)))}` };
  }, [anchor, view]);

  const visibleVisits = useMemo(() => visits.filter((visit) => {
    const startTime = new Date(visit.scheduled_start).getTime();
    const from = startOfDateKey(range.from).getTime();
    const to = startOfDateKey(range.to).getTime();
    return Number.isFinite(startTime) && startTime >= from && startTime < to && visit.status !== 'cancelled';
  }).sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()), [visits, range]);

  async function loadCreateOptions() {
    setError('');
    try {
      const [clientResult, nurseResult] = await Promise.all([
        apiClient.get<any>('/admin/care/clients'),
        apiClient.get<any>('/admin/care/nurses'),
      ]);
      setClients(Array.isArray(clientResult) ? clientResult : clientResult.items ?? []);
      setNurses(Array.isArray(nurseResult) ? nurseResult : nurseResult.items ?? []);
      setCreateOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client and nurse lists could not be loaded.');
    }
  }

  async function chooseClient(nextClientId: string) {
    setClientId(nextClientId);
    setPlaceId('');
    setCurrentStayId('');
    setPlaces([]);
    if (!nextClientId) return;
    try {
      const [stayResult, placeResult] = await Promise.all([
        apiClient.get<any>(`/admin/care/clients/${encodeURIComponent(nextClientId)}/stays`),
        apiClient.get<any>(`/admin/care/clients/${encodeURIComponent(nextClientId)}/places`),
      ]);
      const stays: any[] = Array.isArray(stayResult) ? stayResult : stayResult.items ?? [];
      const placeRows: Choice[] = Array.isArray(placeResult) ? placeResult : placeResult.items ?? [];
      const today = dateKey(new Date());
      const current = stays.filter((stay) => String(stay.starts_on ?? '') <= today && (!stay.ends_on || String(stay.ends_on) >= today))
        .sort((a, b) => String(b.starts_on ?? '').localeCompare(String(a.starts_on ?? '')))[0];
      setPlaces(placeRows);
      if (current) {
        setCurrentStayId(String(current.id ?? ''));
        if (placeRows.some((place) => String(place.id) === String(current.place_id))) setPlaceId(String(current.place_id));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client’s current stay could not be checked.');
    }
  }

  function isNurseAssigned(nurse: Choice, forClientId: string): boolean {
    const client = clients.find((row) => String(row.id) === String(forClientId));
    return Array.isArray(client?.assigned_nurse_ids) && client.assigned_nurse_ids.map(String).includes(String(nurse.user_id ?? nurse.id));
  }

  async function createVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || saving) return;
    if (!clientId || !nurseId || !placeId || !start || !end) {
      setError('Choose a client, current-stay place, nurse, start and end time.');
      return;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setError('The end time must be after the start time.');
      return;
    }
    if (!currentStayId) {
      setError('This client has no current stay. Add or correct the stay before scheduling a visit.');
      return;
    }
    const body = {
      id: newRecordId(), client_id: clientId, nurse_id: nurseId, place_id: placeId,
      scheduled_start: isoLocal(start), scheduled_end: isoLocal(end), instructions: instructions.trim(),
      confirm_overlap: false,
    };
    setSaving(true); setError('');
    try {
      await apiClient.post('/admin/care/visits', body);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409 && reason.fields.code === 'nurse_busy' && window.confirm('This nurse has an overlapping scheduled visit. Confirm the overlap and record it in the audit log?')) {
        try { await apiClient.post('/admin/care/visits', { ...body, confirm_overlap: true }); }
        catch (retryReason) { setError(retryReason instanceof Error ? retryReason.message : 'Visit could not be created.'); setSaving(false); return; }
      } else {
        setError(reason instanceof Error ? reason.message : 'Visit could not be created.'); setSaving(false); return;
      }
    }
    setSaving(false); setCreateOpen(false); setNotice('Visit created. The current place was copied into the visit snapshot.');
    setClientId(''); setNurseId(''); setPlaceId(''); setCurrentStayId(''); setInstructions(''); setStart(''); setEnd('');
    await loadVisits();
  }

  async function openVisitAction(visit: Visit) {
    setActionVisit(visit); setReplacementNurseId(''); setCancelReason('');
    if (!canReassign) return;
    try {
      const [clientResult, nurseResult] = await Promise.all([
        apiClient.get<any>('/admin/care/clients'),
        apiClient.get<any>('/admin/care/nurses'),
      ]);
      setClients(Array.isArray(clientResult) ? clientResult : clientResult.items ?? []);
      setNurses(Array.isArray(nurseResult) ? nurseResult : nurseResult.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? `Reassignment options could not be loaded. Cancellation is still available. ${reason.message}` : 'Reassignment options could not be loaded. Cancellation is still available.');
    }
  }

  async function saveVisitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionVisit || !canWrite || saving) return;
    setSaving(true); setError('');
    try {
      if (replacementNurseId) {
        if (replacementNurseId === actionVisit.nurse_id) throw new Error('Choose a different nurse to reassign this visit.');
        await apiClient.patch(`/admin/care/visits/${encodeURIComponent(actionVisit.id)}`, { nurse_id: replacementNurseId });
        setNotice('Visit reassigned and recorded in the audit log.');
      } else {
        if (cancelReason.trim().length < 3) throw new Error('Enter a cancellation reason of at least 3 characters.');
        if (!window.confirm('Cancel this visit? The nurse’s offline queue will receive the cancellation tombstone.')) { setSaving(false); return; }
        await apiClient.post(`/admin/care/visits/${encodeURIComponent(actionVisit.id)}/cancel`, { reason: cancelReason.trim() });
        setNotice('Visit cancelled and recorded in the audit log.');
      }
      setActionVisit(null); setReplacementNurseId(''); setCancelReason(''); await loadVisits();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The visit could not be changed.');
    } finally { setSaving(false); }
  }

  function moveAnchor(delta: number) {
    const next = dateFromKey(anchor); next.setDate(next.getDate() + delta * (view === 'week' ? 7 : 1)); setAnchor(dateKey(next));
  }

  const renderVisit = (visit: Visit) => (
    <tr key={visit.id}>
      <td><strong>{timeLabel(visit.scheduled_start)}</strong><small className="stage-muted">{timeLabel(visit.scheduled_end)} end</small></td>
      <td>{displayName(nurses, visit.nurse_id, 'nurse')}</td>
      <td>{displayName(clients, visit.client_id, 'client')}</td>
      <td>{String(visit.place_snapshot?.address_text ?? visit.place_snapshot?.label ?? visit.place_id ?? '—')}</td>
      <td><StatusBadge status={String(visit.status ?? '')}>{String(visit.status).replaceAll('_', ' ')}</StatusBadge></td>
      <td><ButtonGroup size="compact">
        <Button variant="outline" onClick={() => navigate(`/admin/care/visits/${encodeURIComponent(visit.id)}`)}>Review</Button>
        {canWrite && visit.status === 'scheduled' && <Button variant="outline" onClick={() => void openVisitAction(visit)}>Change</Button>}
      </ButtonGroup></td>
    </tr>
  );

  return (
    <div className="stage-page">
      <PageHeader title="Schedule" subtitle="Create, review and coordinate home visits." actions={canCreate ? <Button onClick={() => void loadCreateOptions()}>New visit</Button> : undefined} />
      <div className="stage-toolbar stage-toolbar--schedule">
        <FilterTabs label="Schedule view" value={view} onChange={(value) => setView(value as 'day' | 'week')} tabs={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
        <div className="stage-date-navigation">
          <Button variant="outline" className="stage-nav-arrow" onClick={() => moveAnchor(-1)} aria-label="Previous period">‹</Button>
          <Field className="stage-date-field" label="Date" type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} />
          <Button variant="outline" onClick={() => setAnchor(dateKey(new Date()))}>Today</Button>
          <Button variant="outline" className="stage-nav-arrow" onClick={() => moveAnchor(1)} aria-label="Next period">›</Button>
        </div>
        <strong className="stage-range-label">{range.label}</strong>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {loading ? <p aria-busy="true">Loading schedule…</p> : visibleVisits.length === 0 ? <section className="stage-panel"><p>No visits are scheduled for this period.</p></section> : (
        view === 'day' ? <section className="stage-panel"><div className="stage-table-scroll"><table className="stage-table"><caption>Visits for {range.label}</caption><thead><tr><th>Time</th><th>Nurse</th><th>Client</th><th>Place</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleVisits.map(renderVisit)}</tbody></table></div></section> : (
          <div className="stage-week-grid">{Array.from({ length: 7 }, (_, offset) => { const day = startOfWeek(dateFromKey(anchor)); day.setDate(day.getDate() + offset); const key = dateKey(day); const dayVisits = visibleVisits.filter((visit) => dateKey(new Date(visit.scheduled_start)) === key); return <section className="stage-panel stage-week-day" key={key}><h2>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)} <span>{day.getDate()}</span></h2>{dayVisits.length ? dayVisits.map((visit) => <article className="stage-calendar-visit" key={visit.id}><strong>{timeLabel(visit.scheduled_start)}</strong><span>{displayName(clients, visit.client_id, 'client')}</span><small>{displayName(nurses, visit.nurse_id, 'nurse')}</small><StatusBadge status={String(visit.status ?? '')}>{String(visit.status).replaceAll('_', ' ')}</StatusBadge><Button variant="outline" onClick={() => navigate(`/admin/care/visits/${encodeURIComponent(visit.id)}`)}>Review</Button>{canWrite && visit.status === 'scheduled' && <Button variant="outline" onClick={() => void openVisitAction(visit)}>Change</Button>}</article>) : <p className="stage-muted">No visits</p>}</section>; })}</div>
        )
      )}
      {createOpen && <Modal id="stage-create-visit-title" title="New visit" subtitle="The visit keeps a snapshot of the client’s current stay place." onClose={() => setCreateOpen(false)}><form onSubmit={(event) => void createVisit(event)} className="stage-form">
        <Field label="Client" kind="select" value={clientId} onChange={(event) => void chooseClient(event.target.value)} requiredLabel="required" required><option value="">Choose a client</option>{clients.map((client) => <option key={String(client.id)} value={String(client.id)}>{String(client.display_name ?? client.id)}</option>)}</Field>
        <Field label="Place (from current stay)" kind="select" value={placeId} onChange={(event) => setPlaceId(event.target.value)} requiredLabel="required" required disabled={!clientId || !currentStayId}><option value="">{currentStayId ? 'Choose the current place' : 'Select a client with a current stay'}</option>{places.map((place) => <option key={String(place.id)} value={String(place.id)}>{String(place.label ?? 'Home')} · {String(place.address_text ?? place.id)}</option>)}</Field>
        {clientId && !currentStayId && <Notice tone="error">No active stay was found for this client. Scheduling is blocked until the current stay is corrected.</Notice>}
        <Field label="Nurse" kind="select" value={nurseId} onChange={(event) => setNurseId(event.target.value)} requiredLabel="required" required><option value="">Choose an assigned nurse</option>{nurses.filter((nurse) => nurse.active !== false && isNurseAssigned(nurse, clientId)).map((nurse) => <option key={String(nurse.user_id ?? nurse.id)} value={String(nurse.user_id ?? nurse.id)}>{String(nurse.display_name ?? nurse.staff_number ?? nurse.user_id ?? nurse.id)}</option>)}</Field>
        <div className="stage-form-columns"><Field label="Start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} requiredLabel="required" required /><Field label="End" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} requiredLabel="required" required /></div>
        <Field label="Instructions for the nurse" kind="textarea" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={1000} />
        <ButtonGroup spaced><Button type="submit" disabled={saving || !currentStayId}>{saving ? 'Saving…' : 'Create visit'}</Button><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button></ButtonGroup>
      </form></Modal>}
      {actionVisit && <Modal id="stage-change-visit-title" title="Reassign or cancel" subtitle={<>{displayName(clients, actionVisit.client_id, 'client')} · {timeLabel(actionVisit.scheduled_start)} · {displayDate(String(actionVisit.scheduled_start))}</>} onClose={() => setActionVisit(null)}><form onSubmit={(event) => void saveVisitAction(event)} className="stage-form"><div className="stage-panel"><h3>Reassign visit</h3>{canReassign ? <Field label="Replacement nurse" kind="select" value={replacementNurseId} onChange={(event) => setReplacementNurseId(event.target.value)}><option value="">Do not reassign</option>{nurses.filter((nurse) => nurse.active !== false && isNurseAssigned(nurse, String(actionVisit.client_id))).map((nurse) => <option key={String(nurse.user_id ?? nurse.id)} value={String(nurse.user_id ?? nurse.id)}>{String(nurse.display_name ?? nurse.staff_number ?? nurse.user_id ?? nurse.id)}</option>)}</Field> : <p className="stage-muted">Your role does not include the client and nurse read scopes needed to reassign. Cancellation remains available.</p>}<p className="stage-muted">The server checks assignment reach and writes the change to the audit log.</p></div><div className="stage-panel stage-danger-panel"><h3>Cancel visit</h3><Field label="Reason for cancellation (required if cancelling)" kind="textarea" value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setReplacementNurseId(''); }} minLength={3} maxLength={500} /><p className="stage-muted">Cancellation sends a tombstone to the nurse’s sync queue; it does not delete the visit record.</p></div><ButtonGroup spaced><Button type="submit" disabled={saving || (!replacementNurseId && cancelReason.trim().length < 3)}>{saving ? 'Saving…' : replacementNurseId ? 'Confirm reassign' : 'Confirm cancellation'}</Button><Button type="button" variant="outline" onClick={() => setActionVisit(null)}>Keep visit</Button></ButtonGroup></form></Modal>}
    </div>
  );
}
