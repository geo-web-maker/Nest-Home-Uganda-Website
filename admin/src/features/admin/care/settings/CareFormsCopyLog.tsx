import { useCallback, useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import '../clients/care-forms-admin.css';
import { LoadingNote } from '../../../../components/admin/LoadingNote';

type CopyLogRow = { instance_id: string; client_id: string; status: 'sent' | 'failed' | 'skipped'; reason?: string | null; recipient_hint?: string | null; at: string };
function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Delivery diagnostics contain recipient hints only, never patient or form content. */
export function CareFormsCopyLog() {
  const [items, setItems] = useState<CopyLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await apiClient.get<{ items: CopyLogRow[] }>('/admin/care/care-forms/copy-log', { params: { limit: 100 } }); setItems(result.items ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The copy log could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="care-form cf-copy-log" aria-labelledby="cf-copy-log-title">
    <div className="cf-admin-head"><div><h2 id="cf-copy-log-title">Automatic client-copy log</h2><p>Delivery state and masked recipient hint only. Health information is never included in email bodies or this log.</p></div><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button></div>
    {loading ? <LoadingNote>Loading copy log…</LoadingNote> : error ? <p role="alert">{error}</p> : items.length === 0 ? <p>No automatic copies have been attempted.</p> : <div className="cf-copy-log__table-wrap"><table><thead><tr><th>Time</th><th>Delivery</th><th>Recipient</th><th>Reason</th><th>Document reference</th></tr></thead><tbody>{items.map((row, index) => <tr key={`${row.instance_id}:${row.at}:${index}`}><td>{when(row.at)}</td><td><span className={`cf-copy-status is-${row.status}`}>{row.status}</span></td><td>{row.recipient_hint || '—'}</td><td>{row.reason || '—'}</td><td><code>{row.instance_id}</code></td></tr>)}</tbody></table></div>}
  </section>;
}
