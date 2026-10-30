import { useState } from 'react';
import type { CachedHistoryVisit } from '../offline/db';
import { formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';
import { statusKind } from '../ui/statusChip';

type Props = { history: CachedHistoryVisit[]; loading: boolean; hasMore: boolean; onLoadMore: () => void; pendingVisitIds?: string[] };

function verificationLabel(item: CachedHistoryVisit, pending: boolean): string {
  if (pending || item.verification_label === 'pending_sync') return copy.history.pendingSync;
  if (item.verification_label === 'verified') return copy.history.verified;
  if (item.verification_label === 'needs_review') return copy.history.needsReview;
  return visitStatusLabel(item.status);
}
function shortDay(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
}
function durationLabel(item: CachedHistoryVisit) {
  const start = Date.parse(item.check_in_at || item.scheduled_start);
  const end = Date.parse(item.check_out_at || item.scheduled_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return copy.history.durationUnavailable;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${String(remainder).padStart(2, '0')}m` : `${minutes}m`;
}

export function HistoryScreen({ history, loading, hasMore, onLoadMore, pendingVisitIds = [] }: Props) {
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const pendingIds = new Set(pendingVisitIds);
  const groups = new Map<string, CachedHistoryVisit[]>();
  for (const visit of history) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(visit.scheduled_start));
    groups.set(date, [...(groups.get(date) ?? []), visit]);
  }
  return <section className="screen history-screen mk-history-screen" aria-labelledby="history-heading">
    <header className="screen-heading"><div><p className="eyebrow">{copy.history.eyebrow}</p><h2 id="history-heading">{copy.history.title}</h2></div></header>
    {history.length === 0 && <Card className="empty-state"><h3>{copy.history.noHistory}</h3><p>{copy.history.empty}</p></Card>}
    {[...groups.entries()].map(([date, items]) => <section className="history-group mk-history-group" key={date} aria-label={date}>
      <h3>{shortDay(items[0].scheduled_start)}</h3>
      <div className="mk-history-list">{items.map((item) => {
        const pending = pendingIds.has(item.id);
        const label = verificationLabel(item, pending);
        const expanded = expandedVisitId === item.id;
        const clientName = item.client_display_name?.trim() || copy.history.clientFallback;
        return <Card className="history-card" key={item.id}>
          <button type="button" className="mk-history-toggle" aria-expanded={expanded} onClick={() => setExpandedVisitId(expanded ? null : item.id)}>
            <span className="mk-history-main"><strong>{clientName}</strong><small>{formatKampala(item.scheduled_start).split(',').slice(-1)[0].trim()} · {durationLabel(item)}</small></span>
            <Chip kind={pending ? 'pd' : statusKind(item.status, item.verification_label)}>{label}</Chip>
          </button>
          {expanded && <section className="history-past-details mk-history-details" aria-label={copy.history.pastVisit}>
            <p className="eyebrow">{copy.history.pastVisit}</p><p className="muted">{copy.history.readOnly}</p>
            <dl>
              <div><dt>{copy.history.scheduled}</dt><dd>{formatKampala(item.scheduled_start)} – {formatKampala(item.scheduled_end)}</dd></div>
              <div><dt>{copy.history.actualArrival}</dt><dd>{item.check_in_at ? formatKampala(item.check_in_at) : copy.history.noArrival}</dd></div>
              <div><dt>{copy.history.actualDeparture}</dt><dd>{item.check_out_at ? formatKampala(item.check_out_at) : copy.history.noDeparture}</dd></div>
              <div><dt>{copy.history.past}</dt><dd>{label}</dd></div>
              <div><dt>{copy.history.reference}</dt><dd>{item.id}</dd></div>
            </dl>
            <button type="button" className="mk-history-close" onClick={() => setExpandedVisitId(null)}>{copy.history.hideDetails}</button>
          </section>}
        </Card>;
      })}</div>
    </section>)}
    {hasMore && <PillButton className="history-load-more" tone="ghost" onClick={onLoadMore} disabled={loading}>{loading ? copy.history.loading : copy.history.loadMore}</PillButton>}
  </section>;
}
