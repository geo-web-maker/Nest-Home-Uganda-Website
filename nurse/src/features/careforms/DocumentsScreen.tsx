import { useMemo, useState } from 'react';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { PillButton } from '../../ui/PillButton';
import { FormLauncher, type Launch } from './FormLauncher';
import { formTitle, statusChip, statusLabel } from './rules';
import { useCareFormsContext } from './useCareForms';

const FILTERS = [['all', 'All'], ['pending', 'Needs signature'], ['draft', 'Drafts'], ['signed', 'Signed']] as const;
/** Documents tab: every form by client, with its status. Signed documents open the sealed PDF. */
export function DocumentsScreen() {
  const care = useCareFormsContext();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await care?.refresh(); } finally { setRefreshing(false); } };
  const groups = useMemo(() => {
    const docs = (care?.boot?.documents ?? []).filter((d) => filter === 'all' || d.status === filter);
    return (care?.boot?.clients ?? []).map((c) => ({ client: c, docs: docs.filter((d) => d.client_id === c.id).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')) })).filter((g) => g.docs.length);
  }, [care?.boot, filter]);
  return <section className="screen cf-documents" aria-labelledby="documents-heading">
    <header className="screen-heading"><div><p className="eyebrow">Care forms</p><h2 id="documents-heading">Documents</h2></div>
      <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!care?.online || refreshing} onClick={() => void refresh()}>{refreshing ? 'Syncing…' : 'Refresh'}</PillButton></header>
    <div className="cf-tabs" role="group" aria-label="Filter documents">{FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {!care?.ready && <Card><p>Documents will appear here once they have loaded. They stay available offline after the first load.</p></Card>}
    {care?.ready && groups.length === 0 && <Card><p>No documents match.</p></Card>}
    {groups.map(({ client, docs }) => <Card key={client.id} className="cf-group"><h3>{client.display_name} <Chip kind="sc">{client.patient_type}</Chip></h3>
      <ul>{docs.map((d) => <li key={d.id}><button type="button" className="cf-item" onClick={() => setLaunch({ formId: d.form_id, clientId: client.id, clientName: client.display_name, visitId: d.visit_id ?? null, doc: d })}>
        <span className="cf-item__title">{formTitle(d.form_id)}<small>{d.form_id === 'tracker' ? `Week of ${String(d.data.week_start ?? '')}` : d.signed_at ? new Date(d.signed_at).toLocaleDateString('en-GB') : d.updated_at ? new Date(d.updated_at).toLocaleDateString('en-GB') : ''}</small></span>
        <Chip kind={statusChip(d.status)}>{statusLabel(d.status, d.queued)}</Chip></button></li>)}</ul></Card>)}
    <FormLauncher launch={launch} onClose={() => setLaunch(null)} />
  </section>;
}
