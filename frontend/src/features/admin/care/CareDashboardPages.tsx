import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import './stage30-38.css';

type DashboardData = {
  visit_counts?: Record<string, number>;
  open_alerts?: number;
  critical_alerts?: number;
  on_call_now?: number;
  on_call_schedule_enabled?: boolean;
  on_call_schedule_matches?: number;
  on_call_schedule_gap?: boolean;
  as_of?: string;
};

const formatTime = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? 'Not provided' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await apiClient.get<DashboardData>('/admin/care/dashboard')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Dashboard data could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, load };
}

export function CareLiveDashboardPage() {
  const { data, loading, error, load } = useDashboardData();
  return <div className="stage-page">
    <PageHeader title="Live care dashboard" subtitle="Current server-side care-operation counts, filtered to your permitted team or reach." actions={<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>} />
    {error && <div className="stage-message stage-message--error" role="alert">{error}</div>}
    <p className="stage-label-note">Snapshot time: {formatTime(data?.as_of)}. This view refreshes when you request it; it does not claim a continuously streamed feed.</p>
    <div className="stage-summary-strip">
      <div><strong>{loading ? '…' : Number(data?.visit_counts?.scheduled ?? 0)}</strong><span>Scheduled visits</span></div>
      <div><strong>{loading ? '…' : Number(data?.visit_counts?.in_progress ?? 0)}</strong><span>In progress</span></div>
      <div><strong>{loading ? '…' : Number(data?.open_alerts ?? 0)}</strong><span>Open alerts</span></div>
      <div><strong>{loading ? '…' : Number(data?.critical_alerts ?? 0)}</strong><span>Critical open alerts</span></div>
      <div><strong>{loading ? '…' : Number(data?.on_call_now ?? 0)}</strong><span>On-call recipients now</span></div>
    </div>
    {data?.on_call_schedule_gap && <div className="stage-message stage-message--error" role="alert">The approved on-call roster has no matching contact for the current time. The dispatch system may use the configured fallback contacts; review the roster before relying on it.</div>}
    {data?.on_call_schedule_enabled && !data?.on_call_schedule_gap && <p className="stage-label-note">Approved roster is active. {Number(data?.on_call_schedule_matches ?? 0)} scheduled contact number(s) match the current time.</p>}
    <div className="stage-grid">
      <section className="stage-panel"><h2>Operational shortcuts</h2><p>Open the server-backed work queue that needs attention.</p><div className="stage-modal-actions"><Button href="/admin/care/schedule">Schedule</Button><Button href="/admin/care/alerts" variant="outline">Alerts</Button><Button href="/admin/care/sos" variant="outline">SOS console</Button></div></section>
      <section className="stage-panel"><h2>Recent visit outcomes</h2><div className="stage-chart">{['completed', 'missed', 'cancelled'].map((status) => <div key={status} className="stage-chart-row"><span>{status.replaceAll('_', ' ')}</span><div className="stage-chart-track"><span className="stage-chart-bar" style={{ width: `${Math.min(100, Number(data?.visit_counts?.[status] ?? 0) / Math.max(1, ...Object.values(data?.visit_counts ?? {}).map(Number)) * 100)}%` }} /></div><strong className="stage-count">{loading ? '…' : Number(data?.visit_counts?.[status] ?? 0)}</strong></div>)}</div><p className="stage-label-note">Counts are from the current API snapshot, not a historical trend.</p></section>
    </div>
  </div>;
}

export function CareExecutiveDashboardPage() {
  const { data, loading, error, load } = useDashboardData();
  const rows = useMemo(() => Object.entries(data?.visit_counts ?? {}).filter(([status]) => ['scheduled', 'in_progress', 'completed', 'cancelled', 'missed'].includes(status)).map(([status, count]) => ({ status, count: Number(count ?? 0) })), [data]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Math.max(0, row.count), 0), [rows]);
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <div className="stage-page">
    <PageHeader title="Executive care overview" subtitle="A compact operational snapshot for oversight; values remain scoped to your account's permitted reach." actions={<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>} />
    {error && <div className="stage-message stage-message--error" role="alert">{error}</div>}
    <p className="stage-label-note">Snapshot time: {formatTime(data?.as_of)}. No historical trend is inferred because the dashboard endpoint returns current counts only.</p>
    <div className="stage-summary-strip"><div><strong>{loading ? '…' : total}</strong><span>Visits across returned statuses</span></div><div><strong>{loading ? '…' : Number(data?.visit_counts?.completed ?? 0)}</strong><span>Completed visits</span></div><div><strong>{loading ? '…' : Number(data?.open_alerts ?? 0)}</strong><span>Open alerts</span></div><div><strong>{loading ? '…' : Number(data?.critical_alerts ?? 0)}</strong><span>Critical alerts</span></div><div><strong>{loading ? '…' : Number(data?.on_call_now ?? 0)}</strong><span>On-call recipients now</span></div></div>
    {data?.on_call_schedule_gap && <div className="stage-message stage-message--error" role="alert">Approved on-call schedule gap: no scheduled contact matches the current time. Check configured fallback contacts and the roster.</div>}
    <div className="stage-grid">
      <section className="stage-panel"><h2>Current visit status mix</h2><div className="stage-chart" aria-label="Current visit count by status">{rows.map((row) => <div className="stage-chart-row" key={row.status}><span>{row.status.replaceAll('_', ' ')}</span><div className="stage-chart-track"><span className="stage-chart-bar" style={{ width: `${row.count / max * 100}%` }} /></div><strong className="stage-count">{loading ? '…' : row.count}</strong></div>)}</div><p className="stage-label-note">Counts cover the returned page-wide/reach-scoped snapshot. Statuses with no records are shown as zero where returned by the API.</p></section>
      <section className="stage-panel"><h2>Safety overview</h2><div className="stage-summary-strip" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}><div><strong>{loading ? '…' : Number(data?.open_alerts ?? 0)}</strong><span>Open alerts</span></div><div><strong>{loading ? '…' : Number(data?.critical_alerts ?? 0)}</strong><span>Critical alerts</span></div></div><div className="stage-modal-actions"><Button href="/admin/care/alerts" variant="outline">Review alerts</Button><Button href="/admin/care/timesheets" variant="outline">Timesheets</Button><Button href="/admin/care/reports/visits" variant="outline">Visit reports</Button></div></section>
    </div>
  </div>;
}
