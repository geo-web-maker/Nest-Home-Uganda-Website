/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { StatusBadge } from '../../../components/ui/Badge';

type Row = Record<string, any>;
const time = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
};
const dateTime = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
const statusLabel = (status: unknown) => String(status ?? 'unknown').replaceAll('_', ' ');

export function VisitListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [nurses, setNurses] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canSchedule = hasScopes(user, ['visits:write']);
  const clientName = (id: unknown) => clients.find((client) => String(client.id) === String(id))?.display_name ?? String(id ?? '—');
  const nurseName = (id: unknown) => {
    const row = nurses.find((nurse) => String(nurse.user_id ?? nurse.id) === String(id));
    return row?.display_name ?? row?.staff_number ?? String(id ?? '—');
  };
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: any = await apiClient.get('/admin/care/visits', { params: { page: 1, page_size: 200, status: status || undefined } });
      setRows(Array.isArray(result) ? result : result.items ?? []);
      const lookups: Promise<any>[] = [];
      if (hasScopes(user, ['clients:read'])) lookups.push(apiClient.get('/admin/care/clients'));
      else lookups.push(Promise.resolve(null));
      if (hasScopes(user, ['nurses:read'])) lookups.push(apiClient.get('/admin/care/nurses'));
      else lookups.push(Promise.resolve(null));
      const [clientsResult, nursesResult] = await Promise.all(lookups);
      setClients(clientsResult ? (Array.isArray(clientsResult) ? clientsResult : clientsResult.items ?? []) : []);
      setNurses(nursesResult ? (Array.isArray(nursesResult) ? nursesResult : nursesResult.items ?? []) : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Visits could not be loaded.');
    } finally { setLoading(false); }
  }, [status, user]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => rows.filter((row) => !status || row.status === status), [rows, status]);
  return <div className="stage-page">
    <PageHeader title="Visits" subtitle="Review scheduled and completed visits, including verification details." actions={<><Button variant="outline" onClick={() => void load()}>Refresh</Button>{canSchedule && <Button onClick={() => navigate('/admin/care/schedule')}>Open schedule</Button>}</>} />
    <div className="stage-toolbar"><Field label="Status" kind="select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="missed">Missed</option><option value="cancelled">Cancelled</option></Field><span className="stage-muted">{visible.length} visit{visible.length === 1 ? '' : 's'} shown</span></div>
    {error && <Notice tone="error">{error}</Notice>}
    {loading ? <p aria-busy="true">Loading visits…</p> : visible.length === 0 ? <section className="stage-panel"><p>No visits match this status.</p></section> : <section className="stage-panel"><div className="stage-table-scroll"><table className="stage-table"><caption>Visit list</caption><thead><tr><th>Visit</th><th>Client</th><th>Nurse</th><th>Scheduled</th><th>Verification</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((row) => <tr key={String(row.id)}><td><strong>{String(row.id)}</strong><small className="stage-muted">{row.adhoc ? 'Ad-hoc visit' : 'Scheduled visit'}</small></td><td>{clientName(row.client_id)}</td><td>{nurseName(row.nurse_id)}</td><td><strong>{dateTime(row.scheduled_start)}</strong><small className="stage-muted">Ends {time(row.scheduled_end)}</small></td><td>{row.latest_verification ? <><span>{statusLabel(row.latest_verification)}</span>{row.last_event_at && <small className="stage-muted">{dateTime(row.last_event_at)}</small>}</> : row.check_in_at ? 'Check-in recorded (verification not available)' : 'Not yet checked in'}{row.last_event_distance_m != null && <small className="stage-muted">Distance {Math.round(Number(row.last_event_distance_m))} m</small>}{row.last_event_accuracy_m != null && <small className="stage-muted">Accuracy {Math.round(Number(row.last_event_accuracy_m))} m</small>}</td><td><StatusBadge status={String(row.status ?? '')}>{statusLabel(row.status)}</StatusBadge></td><td><Button variant="outline" onClick={() => navigate(`/admin/care/visits/${encodeURIComponent(String(row.id))}`)}>Review</Button></td></tr>)}</tbody></table></div></section>}
    <p className="stage-footnote">Visit detail includes events, notes, flags, photo metadata, annotations and the audit trail. Data is restricted to your assigned reach by the server.</p>
  </div>;
}

type Photo = Row & { id: string; visit_id: string; status?: string; created_at?: string; thumbnail_path?: { path?: string; expires_at?: number }; original_path?: { path?: string; expires_at?: number } };
export function VisitPhotosPage() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [streamPath, setStreamPath] = useState('');
  const [filter, setFilter] = useState('');
  const [hideTarget, setHideTarget] = useState<Photo | null>(null);
  const [hideReason, setHideReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const canHide = hasScopes(user, ['photos:hide']);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: any = await apiClient.get('/admin/care/photos');
      const items: Photo[] = Array.isArray(result) ? result : result.items ?? [];
      setPhotos(items.filter((photo) => !['hidden', 'expired'].includes(String(photo.status))));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Photo gallery could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => photos.filter((photo) => JSON.stringify([photo.visit_id, photo.photo_type, photo.status, photo.created_at]).toLowerCase().includes(filter.toLowerCase())), [photos, filter]);
  async function openPhoto(photo: Photo) {
    setError(''); setNotice('');
    try {
      // Refresh the short-lived signed paths on every open; never persist or cache the URL.
      const result: any = await apiClient.get(`/admin/care/visits/${encodeURIComponent(photo.visit_id)}/photos`);
      const fresh = (result.items ?? []).find((item: Photo) => item.id === photo.id) as Photo | undefined;
      if (!fresh?.original_path?.path) throw new Error('This photo is no longer available. The link may have expired or the photo may have been hidden.');
      setSelected(fresh); setStreamPath(fresh.original_path.path);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Photo could not be opened.'); }
  }
  async function hidePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hideTarget || !canHide || hideReason.trim().length < 3 || saving) return;
    setSaving(true); setError('');
    try {
      await apiClient.post(`/admin/care/photos/${encodeURIComponent(hideTarget.id)}/hide`, { note: hideReason.trim() });
      setPhotos((current) => current.filter((photo) => photo.id !== hideTarget.id));
      if (selected?.id === hideTarget.id) { setSelected(null); setStreamPath(''); }
      setHideTarget(null); setHideReason(''); setNotice('Photo hidden. The record is retained; deletion is not available.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Photo could not be hidden.'); }
    finally { setSaving(false); }
  }
  return <div className="stage-page">
    <PageHeader title="Visit photos" subtitle="Private evidence, delivered through short-lived audited links." actions={<Button variant="outline" onClick={() => void load()}>Refresh gallery</Button>} />
    <Notice role={null}>Every image open is audited. Hidden and expired items are excluded. The gallery does not expose permanent storage URLs.</Notice>
    <Field label="Search by visit or photo type" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {loading ? <p aria-busy="true">Loading photos…</p> : visible.length === 0 ? <section className="stage-panel"><p>No visible photos were found.</p></section> : <section className="stage-photo-grid" aria-label="Visit photo gallery">{visible.map((photo) => <article className="stage-photo-card" key={photo.id}><button type="button" className="stage-photo-open" onClick={() => void openPhoto(photo)} aria-label={`Open photo from visit ${photo.visit_id}`}><span className="stage-photo-placeholder">{String(photo.photo_type ?? 'Private photo').replaceAll('_', ' ')}</span></button><div><strong>{String(photo.photo_type ?? 'Visit photo').replaceAll('_', ' ')}</strong><small>Visit: <Link to={`/admin/care/visits/${encodeURIComponent(photo.visit_id)}`}>{photo.visit_id}</Link></small><small>{dateTime(photo.created_at)}</small><StatusBadge status="">{statusLabel(photo.status ?? 'available')}</StatusBadge><div className="stage-modal-actions"><Button variant="outline" onClick={() => void openPhoto(photo)}>View</Button>{canHide && <Button variant="outline" onClick={() => { setHideTarget(photo); setHideReason(''); }}>Hide</Button>}</div></div></article>)}</section>}
    {selected && <Modal id="stage-photo-title" title="Photo review" subtitle={<>Visit {selected.visit_id} · {String(selected.photo_type ?? 'photo')}</>} onClose={() => { setSelected(null); setStreamPath(''); }} className="stage-photo-modal">{streamPath ? <img src={streamPath} alt={`Private visit photo for visit ${selected.visit_id}`} /> : <p>This photo link has expired. Close and reopen the photo to request a fresh link.</p>}<p className="stage-muted">The view is private and audited. Signed links expire after a short period.</p></Modal>}
    {hideTarget && <Modal id="stage-hide-photo-title" title="Hide photo" subtitle="The photo record will remain in the audit history." onClose={() => setHideTarget(null)}><form className="stage-form" onSubmit={(event) => void hidePhoto(event)}><Field label="Reason for hiding (required)" kind="textarea" value={hideReason} onChange={(event) => setHideReason(event.target.value)} minLength={3} maxLength={500} requiredLabel="required" required /><div className="stage-modal-actions"><Button type="submit" disabled={saving || hideReason.trim().length < 3}>{saving ? 'Saving…' : 'Hide photo'}</Button><Button type="button" variant="outline" onClick={() => setHideTarget(null)}>Keep visible</Button></div></form></Modal>}
  </div>;
}
