import { Link } from 'react-router-dom';
import { Card } from '../../ui/Card';
import { kampalaDateKey } from '../../lib/time';
import type { CachedVisit } from '../../offline/db';
import { trackerAllowed, weekStartOf, formTitle } from './rules';
import { useCareFormsContext } from './useCareForms';

export type Summary = { needsSignature: number; dueToday: number; signedThisWeek: number; urgent: string | null };
export function summarise(care: { docsFor: (c?: string | null) => { form_id: string; client_id: string; status: string; signed_at?: string | null; data: Record<string, unknown> }[]; typeOf: (c?: string | null) => string; signedIds: (c?: string | null) => string[]; boot: { gates_enabled: boolean; clients: { id: string; display_name: string }[] } | null },
  visits: Pick<CachedVisit, 'client_id' | 'client_display_name' | 'status' | 'scheduled_start'>[], today = kampalaDateKey(new Date())): Summary {
  const docs = care.docsFor(null);
  const pending = docs.filter((d) => d.status === 'pending');
  const week = weekStartOf(today);
  const todays = visits.filter((v) => v.client_id && v.status !== 'completed' && v.status !== 'cancelled' && kampalaDateKey(v.scheduled_start) === today);
  const missing03 = todays.filter((v) => !care.signedIds(v.client_id).includes('03'));
  const trackerDue = todays.filter((v) => trackerAllowed(care.typeOf(v.client_id)) && !docs.some((d) => d.client_id === v.client_id && d.form_id === 'tracker' && ((d.data.entries as { date: string }[] | undefined) ?? []).some((e) => e.date === today)));
  const name = (id: string) => care.boot?.clients.find((c) => c.id === id)?.display_name ?? 'client';
  const urgent = pending[0] ? `Countersign ${formTitle(pending[0].form_id)} for ${name(pending[0].client_id)}` : missing03[0] ? `Form 03 needed for ${missing03[0].client_display_name}` : trackerDue[0] ? `Tracker entry due for ${trackerDue[0].client_display_name}` : null;
  return { needsSignature: pending.length, dueToday: missing03.length + trackerDue.length, signedThisWeek: docs.filter((d) => d.status === 'signed' && (d.signed_at ?? '').slice(0, 10) >= week).length, urgent };
}

/** Home summary card: needs signature / due today / signed this week / most urgent. Shows counts only, no health details. */
export function HomeSummaryCard({ visits }: { visits: CachedVisit[] }) {
  const care = useCareFormsContext();
  if (!care?.ready) return null;
  const s = summarise(care, visits);
  return <Card className="cf-home" aria-label="Care forms summary">
    <div className="mk-section-title"><p className="eyebrow">Care forms</p><Link to="/documents" className="cf-link">Open Documents</Link></div>
    <dl className="cf-stats"><div><dt>Needs signature</dt><dd>{s.needsSignature}</dd></div><div><dt>Due today</dt><dd>{s.dueToday}</dd></div><div><dt>Signed this week</dt><dd>{s.signedThisWeek}</dd></div></dl>
    {s.urgent && <p className="cf-urgent">{s.urgent}</p>}
  </Card>;
}
