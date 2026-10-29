/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { DataTable } from '../../../components/admin/DataTable';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { StatusBadge } from '../../../components/ui/Badge';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { FilterBar } from '../../../components/admin/FilterBar';

type Row = Record<string, any> & { id: string };
const dateTime = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};
const human = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');

export function AlertsPage() {
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['alerts:write']);
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result: any = await apiClient.get('/admin/care/alerts', { params: { status } });
      setRows(Array.isArray(result) ? result : result.items ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Alerts could not be loaded.'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  async function acknowledge(row: Row) {
    if (!canWrite) return;
    setSaving(true); setError('');
    try { await apiClient.post(`/admin/care/alerts/${encodeURIComponent(row.id)}/acknowledge`, {}); setNotice('Alert acknowledged.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Alert could not be acknowledged.'); }
    finally { setSaving(false); }
  }
  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resolveTarget || !canWrite || note.trim().length < 3 || saving) return;
    setSaving(true); setError('');
    try { await apiClient.post(`/admin/care/alerts/${encodeURIComponent(resolveTarget.id)}/resolve`, { note: note.trim() }); setNotice('Alert resolved with an audit note.'); setResolveTarget(null); setNote(''); setDetail(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Alert could not be resolved.'); }
    finally { setSaving(false); }
  }
  const counts = useMemo(() => ({ critical: rows.filter((row) => row.severity === 'critical').length, missed: rows.filter((row) => /missed|check.?in/i.test(String(row.type))).length }), [rows]);
  return <div className="stage-page">
    <PageHeader title="Alerts" subtitle="Review care-operation signals. An acknowledgement is not the same as resolution." actions={<Button variant="outline" onClick={() => void load()}>Refresh</Button>} />
    <div className="stage-summary-strip"><div><strong>{rows.length}</strong><span>{human(status)} alerts</span></div><div><strong>{counts.critical}</strong><span>Critical in this view</span></div><div><strong>{counts.missed}</strong><span>Missed check-ins</span></div><div><strong>{rows.filter((row) => row.acknowledged_at).length}</strong><span>With acknowledgement time</span></div></div>
    <FilterTabs label="Alert status" value={status} onChange={setStatus} tabs={['open', 'acknowledged', 'resolved'].map((value) => ({ value, label: human(value) }))} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {loading ? <p aria-busy="true">Loading alerts…</p> : rows.length === 0 ? <section className="stage-panel"><p>No {status} alerts.</p></section> : <section className="stage-panel"><DataTable
    columns={[
      { key: 'alert', header: 'Alert', cell: (row) => <button className="stage-text-action" type="button" onClick={() => setDetail(row)}><strong>{human(row.type)}</strong><small>{String(row.message ?? row.id)}</small></button> },
      { key: 'severity', header: 'Severity', cell: (row) => <StatusBadge status={row.severity === 'critical' ? 'danger' : 'warning'}>{human(row.severity)}</StatusBadge> },
      { key: 'raised', header: 'Raised', cell: (row) => dateTime(row.raised_at) },
      { key: 'nurse', header: 'Nurse', cell: (row) => String(row.nurse_id ?? '—') },
      { key: 'visit', header: 'Visit', cell: (row) => String(row.visit_id ?? '—') },
      { key: 'status', header: 'Status', cell: (row) => human(row.status) },
      { key: 'action', header: 'Action', cell: (row) => <ButtonGroup size="compact"><Button variant="outline" onClick={() => setDetail(row)}>Details</Button>{canWrite && row.status === 'open' && <Button variant="outline" disabled={saving} onClick={() => void acknowledge(row)}>Acknowledge</Button>}{canWrite && row.status !== 'resolved' && <Button disabled={saving} onClick={() => { setResolveTarget(row); setNote(''); }}>Resolve</Button>}</ButtonGroup> },
    ]}
    rows={rows}
    getRowKey={(row) => row.id}
    labels={{ caption: `${human(status)} care alerts`, loading: 'Loading…', empty: 'Nothing to show.' }}
  /></section>}
    {detail && <Modal id="stage-alert-detail-title" title={human(detail.type)} subtitle={<>{String(detail.message ?? 'Care alert')} · {dateTime(detail.raised_at)}</>} onClose={() => setDetail(null)}><div className="stage-detail-grid"><div><h3>Alert details</h3><dl><dt>Status</dt><dd>{human(detail.status)}</dd><dt>Severity</dt><dd>{human(detail.severity)}</dd><dt>Nurse</dt><dd>{String(detail.nurse_id ?? '—')}</dd><dt>Visit</dt><dd>{String(detail.visit_id ?? '—')}</dd><dt>Acknowledged</dt><dd>{dateTime(detail.acknowledged_at)}</dd><dt>Resolved</dt><dd>{dateTime(detail.resolved_at)}</dd></dl></div><div><h3>History</h3>{Array.isArray(detail.history) && detail.history.length ? <ol className="stage-event-list">{detail.history.map((event: Row, index: number) => <li key={`${event.action ?? 'event'}-${index}`}><strong>{human(event.action ?? event.type)}</strong><span>{dateTime(event.at ?? event.created_at)}</span>{event.note && <p>{String(event.note)}</p>}</li>)}</ol> : <p>No extra alert history is recorded.</p>}</div></div>{canWrite && detail.status !== 'resolved' && <ButtonGroup spaced>{detail.status === 'open' && <Button variant="outline" onClick={() => void acknowledge(detail)}>Acknowledge</Button>}<Button onClick={() => { setResolveTarget(detail); setNote(''); }}>Resolve with note</Button></ButtonGroup>}</Modal>}
    {resolveTarget && <Modal id="stage-resolve-alert-title" title="Resolve alert" subtitle={String(resolveTarget.message ?? resolveTarget.id)} onClose={() => setResolveTarget(null)}><form className="stage-form" onSubmit={(event) => void resolve(event)}><Field label="Resolution note (required)" kind="textarea" value={note} onChange={(event) => setNote(event.target.value)} minLength={3} maxLength={500} requiredLabel="required" required /><ButtonGroup spaced><Button type="submit" disabled={saving || note.trim().length < 3}>{saving ? 'Saving…' : 'Save and resolve'}</Button><Button type="button" variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button></ButtonGroup></form></Modal>}
  </div>;
}

export function TimesheetsPage() {
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['timesheets:write']);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('submitted');
  const [nurseId, setNurseId] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const result: any = await apiClient.get('/admin/care/timesheets', { params: { status: status || undefined, nurse_id: nurseId || undefined } });
      setRows(Array.isArray(result) ? result : result.items ?? []);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Timesheets could not be loaded.'); }
  }, [status, nurseId]);
  useEffect(() => { void load(); }, [load]);
  async function mutate(action: 'approve' | 'send-back' | 'adjust') {
    if (!selected || !canWrite || saving) return;
    setSaving(true); setError('');
    try {
      const path = `/admin/care/timesheets/${encodeURIComponent(selected.id)}/${action === 'send-back' ? 'send-back' : action}`;
      if (action === 'send-back') {
        if (reason.trim().length < 3) throw new Error('Enter a reason of at least 3 characters.');
        await apiClient.post(path, { note: reason.trim() });
      } else if (action === 'adjust') {
        if (!minutes.trim() || !Number.isInteger(Number(minutes)) || !reason.trim() || reason.trim().length < 3) throw new Error('Enter whole-minute adjustment and a reason of at least 3 characters.');
        await apiClient.post(path, { minutes: Number(minutes), reason: reason.trim() });
      } else { await apiClient.post(path, {}); }
      setNotice(action === 'approve' ? 'Timesheet approved. Approved periods are locked.' : action === 'send-back' ? 'Timesheet sent back with the recorded reason.' : 'Adjustment saved and audited.'); setReason(''); setMinutes(''); await load();
      const refreshed: any = await apiClient.get(`/admin/care/timesheets`, { params: { nurse_id: selected.nurse_id || undefined } });
      const items = Array.isArray(refreshed) ? refreshed : refreshed.items ?? [];
      setSelected(items.find((row: Row) => row.id === selected.id) ?? null);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Timesheet action failed.'); }
    finally { setSaving(false); }
  }
  async function exportApproved(row: Row) {
    setError('');
    try {
      const result = await apiClient.get(`/admin/care/timesheets/${encodeURIComponent(row.id)}/export`);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `timesheet-${row.id}.json`; anchor.click(); URL.revokeObjectURL(url);
      setNotice('Approved timesheet detail exported as JSON.');
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Export failed.'); }
  }
  return <div className="stage-page">
    <PageHeader title="Timesheets" subtitle="Review submitted periods and record decisions. Approved periods are locked." actions={<Button variant="outline" onClick={() => void load()}>Refresh</Button>} />
    <FilterBar label="Filter timesheets"><Field label="Status" kind="select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All periods</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="sent_back">Sent back</option></Field><Field label="Nurse ID" value={nurseId} onChange={(event) => setNurseId(event.target.value)} placeholder="Filter by nurse" /></FilterBar>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {rows.length === 0 ? <section className="stage-panel"><p>No timesheets match this filter.</p></section> : <section className="stage-panel"><DataTable
    columns={[
      { key: 'nurse', header: 'Nurse', cell: (row) => String(row.nurse_name ?? row.nurse_id) },
      { key: 'period', header: 'Period', cell: (row) => <>{String(row.period_start)} – {String(row.period_end)}</> },
      { key: 'visits', header: 'Visits', cell: (row) => String(row.completed_visits ?? 0) },
      { key: 'hours', header: 'Hours', cell: (row) => (Number(row.total_minutes ?? 0) / 60).toFixed(1) },
      { key: 'issues', header: 'Issues', cell: (row) => Array.isArray(row.issue_ids) ? row.issue_ids.length : 0 },
      { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={String(row.status ?? '')}>{human(row.status)}</StatusBadge> },
      { key: 'action', header: 'Action', cell: (row) => <ButtonGroup size="compact"><Button variant="outline" onClick={() => { setSelected(row); setReason(''); setMinutes(''); }}>Review</Button>{row.status === 'approved' && <Button variant="outline" onClick={() => void exportApproved(row)}>Export</Button>}</ButtonGroup> },
    ]}
    rows={rows}
    getRowKey={(row) => row.id}
    labels={{ caption: 'Timesheet periods', loading: 'Loading…', empty: 'Nothing to show.' }}
  /></section>}
    {selected && <Modal id="stage-timesheet-detail-title" title="Timesheet review" subtitle={<>{String(selected.nurse_id)} · {String(selected.period_start)} – {String(selected.period_end)}</>} onClose={() => setSelected(null)}><div className="stage-detail-grid"><div><h3>Period summary</h3><dl><dt>Status</dt><dd>{human(selected.status)}</dd><dt>Completed visits</dt><dd>{String(selected.completed_visits ?? 0)}</dd><dt>Total time</dt><dd>{Number(selected.total_minutes ?? 0)} minutes</dd><dt>Submitted</dt><dd>{dateTime(selected.submitted_at)}</dd><dt>Approved</dt><dd>{dateTime(selected.approved_at)}</dd><dt>Approval issues</dt><dd>{Array.isArray(selected.issue_ids) ? selected.issue_ids.join(', ') || 'None' : 'Not supplied'}</dd></dl></div><div><h3>Recorded adjustments</h3>{Array.isArray(selected.adjustments) && selected.adjustments.length ? <ul>{selected.adjustments.map((item: Row, index: number) => <li key={index}>{String(item.minutes)} min · {String(item.reason)} · {dateTime(item.at)}</li>)}</ul> : <p>No adjustments recorded.</p>}{selected.sent_back_reason && <p><strong>Send-back reason:</strong> {String(selected.sent_back_reason)}</p>}</div></div>{canWrite && selected.status !== 'approved' && <div className="stage-panel"><h3>Review actions</h3>{selected.status === 'submitted' && <ButtonGroup spaced><Button disabled={saving} onClick={() => void mutate('approve')}>Approve</Button><Button variant="outline" disabled={saving || reason.trim().length < 3} onClick={() => void mutate('send-back')}>Send back</Button></ButtonGroup>}<Field label="Reason (required for send-back or adjustment)" kind="textarea" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /><div className="stage-form-columns"><Field label="Adjustment minutes (+/-)" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} min={-10080} max={10080} step={1} /><Button variant="outline" disabled={saving || !minutes.trim() || reason.trim().length < 3} onClick={() => void mutate('adjust')}>Save adjustment</Button></div><p className="stage-muted">The API rejects changes to approved periods. These controls are hidden from read-only accounts.</p></div>}</Modal>}
  </div>;
}
