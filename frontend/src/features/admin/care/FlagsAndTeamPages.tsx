/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';

type Row = Record<string, any> & { id: string };
const dateTime = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
const label = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');
const localDateKey = (value: unknown) => { const date = value instanceof Date ? value : new Date(String(value ?? '')); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export function FlagsQueuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canResolve = hasScopes(user, ['flags:write']);
  const canReview = hasScopes(user, ['visits:read']);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: any = await apiClient.get('/admin/care/flags');
      setRows(Array.isArray(result) ? result : result.items ?? []);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Flags could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const kinds = useMemo(() => [...new Set(rows.map((row) => String(row.type ?? 'other')))], [rows]);
  const visible = useMemo(() => rows.filter((row) => (filter === 'all' || String(row.type ?? '') === filter) && JSON.stringify([row.id, row.type, row.visit_id, row.nurse_id, row.details, row.raised_at]).toLowerCase().includes(query.toLowerCase())), [rows, filter, query]);
  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !canResolve || reason.trim().length < 3 || saving) return;
    setSaving(true); setError('');
    try {
      await apiClient.post(`/admin/care/flags/${encodeURIComponent(target.id)}/resolve`, { reason: reason.trim() });
      setNotice('Flag resolved. The note has been added to the audit log.'); setTarget(null); setReason(''); await load();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Flag could not be resolved.'); }
    finally { setSaving(false); }
  }
  return <div className="stage-page">
    <PageHeader title="Flags" subtitle="Open flags and visit exceptions waiting for supervisor review." actions={<Button variant="outline" onClick={() => void load()}>Refresh</Button>} />
    <div className="stage-summary-strip"><div><strong>{rows.length}</strong><span>Open flags</span></div><div><strong>{rows.filter((row) => /unscheduled|no_visit/i.test(String(row.type))).length}</strong><span>Scheduling review</span></div><div><strong>{rows.filter((row) => /location|distance|accuracy/i.test(String(row.type))).length}</strong><span>Verification</span></div><div><strong>{rows.filter((row) => /photo/i.test(String(row.type))).length}</strong><span>Photo review</span></div></div>
    <div className="stage-toolbar"><Field label="Find a flag" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Flag, visit or nurse" /><Field label="Type" kind="select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All open flags</option>{kinds.map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}</Field></div>
    {error && <div role="alert" className="stage-message stage-message--error">{error}</div>}{notice && <div role="status" className="stage-message">{notice}</div>}
    {loading ? <p aria-busy="true">Loading flags…</p> : visible.length === 0 ? <section className="stage-panel"><p>No open flags match this view.</p></section> : <section className="stage-panel"><div className="stage-table-scroll"><table className="stage-table"><caption>Open flags awaiting review</caption><thead><tr><th>Flag</th><th>Visit</th><th>Nurse</th><th>Raised</th><th>Details</th><th>Action</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><span className="stage-status stage-status--warning">{label(row.type)}</span><small className="stage-muted">{row.id}</small></td><td>{String(row.visit_id ?? 'No visit linked')}</td><td>{String(row.nurse_id ?? '—')}</td><td>{dateTime(row.raised_at)}</td><td>{String(row.details?.message ?? row.details?.reason ?? row.details?.note ?? 'Needs supervisor review')}</td><td className="stage-row-actions">{canReview && row.visit_id && <Button variant="outline" onClick={() => navigate(`/admin/care/visits/${encodeURIComponent(String(row.visit_id))}`)}>Review visit</Button>}{canResolve && <Button onClick={() => { setTarget(row); setReason(''); }}>Resolve</Button>}</td></tr>)}</tbody></table></div></section>}
    {target && <div className="stage-modal-backdrop"><section className="stage-modal" role="dialog" aria-modal="true" aria-labelledby="stage-resolve-flag-title"><header><div><h2 id="stage-resolve-flag-title">Resolve flag</h2><p>{label(target.type)} · Visit {String(target.visit_id ?? 'not linked')}</p></div><Button variant="outline" onClick={() => setTarget(null)}>Close</Button></header><form className="stage-form" onSubmit={(event) => void resolve(event)}><p>Record what you checked and why this flag can be closed. This note is saved to the audit log.</p><Field label="Resolution note (required)" kind="textarea" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} requiredLabel="required" required /><div className="stage-modal-actions"><Button type="submit" disabled={saving || reason.trim().length < 3}>{saving ? 'Saving…' : 'Resolve flag'}</Button><Button type="button" variant="outline" onClick={() => setTarget(null)}>Cancel</Button></div></form></section></div>}
  </div>;
}

export function MyTeamPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canReadVisits = hasScopes(user, ['visits:read']);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [teamResult, visitResult] = await Promise.all([
        apiClient.get<any>('/admin/care/team'),
        canReadVisits ? apiClient.get<any>('/admin/care/visits', { params: { page: 1, page_size: 200 } }) : Promise.resolve({ items: [] }),
      ]);
      setRows(Array.isArray(teamResult) ? teamResult : teamResult.items ?? []);
      setVisits(Array.isArray(visitResult) ? visitResult : visitResult.items ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Team status could not be loaded.'); }
    finally { setLoading(false); }
  }, [canReadVisits]);
  useEffect(() => { void load(); }, [load]);
  const todayKey = localDateKey(new Date());
  const active = rows.filter((row) => row.active !== false).length;
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentlySeen = rows.filter((row) => row.last_seen_at && new Date(row.last_seen_at).getTime() >= recentCutoff).length;
  const scheduledToday = visits.filter((visit) => localDateKey(visit.scheduled_start) === todayKey && !['cancelled', 'completed'].includes(String(visit.status))).length;
  const latestVisit = (nurseId: unknown) => visits.filter((visit) => String(visit.nurse_id) === String(nurseId)).sort((a, b) => new Date(String(b.scheduled_start ?? '')).getTime() - new Date(String(a.scheduled_start ?? '')).getTime())[0];
  return <div className="stage-page">
    <PageHeader title="My team" subtitle="Supervisor view, limited to the team available to your account." actions={<Button variant="outline" onClick={() => void load()}>Refresh</Button>} />
    <div className="stage-summary-strip"><div><strong>{rows.length}</strong><span>Team members</span></div><div><strong>{active}</strong><span>Active staff</span></div><div><strong>{scheduledToday}</strong><span>Visits in progress or scheduled today</span></div><div><strong>{recentlySeen}</strong><span>Seen in the past 24 hours</span></div></div>
    {error && <div role="alert" className="stage-message stage-message--error">{error}</div>}
    {loading ? <p aria-busy="true">Loading team…</p> : rows.length === 0 ? <section className="stage-panel"><p>No team members are in your current scope.</p></section> : <section className="stage-panel"><div className="stage-table-scroll"><table className="stage-table"><caption>Team status</caption><thead><tr><th>Nurse</th><th>Staff number</th><th>Status</th><th>Last seen</th><th>Latest visit status</th><th>Last visit</th></tr></thead><tbody>{rows.map((row) => { const latest = latestVisit(row.user_id); const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0; const seenLabel = !seen ? 'Not recorded' : Date.now() - seen < 30 * 60 * 1000 ? 'Recent' : Date.now() - seen < recentCutoff ? 'Earlier today' : 'Stale'; return <tr key={String(row.user_id)}><td><strong>{String(row.display_name ?? row.name ?? row.user_id)}</strong></td><td>{String(row.staff_number ?? '—')}</td><td><span className={`stage-status ${row.active === false ? 'stage-status--muted' : 'stage-status--success'}`}>{row.active === false ? 'Inactive' : 'Active'}</span></td><td><strong>{dateTime(row.last_seen_at)}</strong><small className="stage-muted">{seenLabel}</small></td><td>{label(latest?.status ?? 'No visit recorded')}</td><td>{dateTime(latest?.updated_at ?? latest?.scheduled_start)}</td></tr>; })}</tbody></table></div></section>}
    <p className="stage-footnote">Last-seen values are based on the server’s recorded heartbeat, not continuous background tracking. Coordinates are shown only in the separately scoped map view.</p>
  </div>;
}
