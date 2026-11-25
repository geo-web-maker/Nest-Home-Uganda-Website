import { useCallback, useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/Button';
import { DataTable } from '../../../../components/admin/DataTable';
import { apiClient } from '@shared/lib/api/client';
import '../clients/care-forms-admin.css';

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
    {error ? <p role="alert">{error}</p> : <DataTable<CopyLogRow>
      columns={[
        { key: 'time', header: 'Time', cell: (row) => when(row.at) },
        { key: 'delivery', header: 'Delivery', cell: (row) => <span className={`cf-copy-status is-${row.status}`}>{row.status}</span> },
        { key: 'recipient', header: 'Recipient', cell: (row) => row.recipient_hint || '—' },
        { key: 'reason', header: 'Reason', cell: (row) => row.reason || '—' },
        { key: 'reference', header: 'Document reference', cell: (row) => <code>{row.instance_id}</code> },
      ]}
      rows={items}
      getRowKey={(row) => `${row.instance_id}:${row.at}`}
      loading={loading}
      labels={{ caption: 'Automatic client-copy delivery log', loading: 'Loading copy log…', empty: 'No automatic copies have been attempted.' }}
    />}
  </section>;
}
