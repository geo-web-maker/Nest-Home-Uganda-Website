import { useState } from 'react';
import type { CachedHistoryVisit } from '../offline/db';
import { formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';

type Props = {
  history: CachedHistoryVisit[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  pendingVisitIds?: string[];
};

function verificationLabel(item: CachedHistoryVisit, pending: boolean): string {
  if (pending) return copy.history.pendingSync;
  if (item.verification_label === 'verified') return copy.history.verified;
  if (item.verification_label === 'needs_review') return copy.history.needsReview;
  return visitStatusLabel(item.status);
}

export function HistoryScreen({ history, loading, hasMore, onLoadMore, pendingVisitIds = [] }: Props) {
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const pendingIds = new Set(pendingVisitIds);
  const groups = new Map<string, CachedHistoryVisit[]>();
  for (const visit of history) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(visit.scheduled_start));
    groups.set(date, [...(groups.get(date) ?? []), visit]);
  }

  return <section className="screen history-screen" aria-labelledby="history-heading">
    <div className="screen-heading"><div><p className="eyebrow">{copy.history.eyebrow}</p><h2 id="history-heading">{copy.history.title}</h2></div></div>
    {history.length === 0 && <div className="empty-state"><h3>{copy.history.noHistory}</h3><p>{copy.history.empty}</p></div>}
    {[...groups.entries()].map(([date, items]) => <section className="history-group" key={date} aria-label={date}>
      <h3>{date}</h3>
      {items.map((item) => {
        const pending = pendingIds.has(item.id);
        const label = verificationLabel(item, pending);
        const expanded = expandedVisitId === item.id;
        const clientName = item.client_display_name?.trim() || 'Client';
        return <article className="visit-card history-card" key={item.id}>
          <div className="visit-card-heading">
            <div className="history-card-title"><strong>{clientName}</strong><span className="muted">{formatKampala(item.scheduled_start)}</span></div>
            <span className={`status-chip ${label === copy.history.verified ? 'status-chip--verified' : label === copy.history.needsReview ? 'status-chip--needs_review' : label === copy.history.pendingSync ? 'status-chip--pending_sync' : `status-chip--${item.status}`}`}>{label}</span>
          </div>
          <p>{copy.history.end} {formatKampala(item.scheduled_end)}</p>
          <p className="muted">{copy.history.reference} {item.id}</p>
          <button type="button" className="button-secondary history-detail-toggle" aria-expanded={expanded} onClick={() => setExpandedVisitId(expanded ? null : item.id)}>{expanded ? copy.history.hideDetails : copy.history.details}</button>
          {expanded && <section className="history-past-details" aria-label={copy.history.pastVisit}>
            <p className="eyebrow">{copy.history.pastVisit}</p>
            <p className="muted">{copy.history.readOnly}</p>
            <dl>
              <div><dt>{copy.history.scheduled}</dt><dd>{formatKampala(item.scheduled_start)} – {formatKampala(item.scheduled_end)}</dd></div>
              <div><dt>{copy.history.actualArrival}</dt><dd>{item.check_in_at ? formatKampala(item.check_in_at) : copy.history.noArrival}</dd></div>
              <div><dt>{copy.history.actualDeparture}</dt><dd>{item.check_out_at ? formatKampala(item.check_out_at) : copy.history.noDeparture}</dd></div>
              <div><dt>{copy.history.past}</dt><dd>{label}</dd></div>
            </dl>
          </section>}
        </article>;
      })}
    </section>)}
    {hasMore && <button type="button" className="history-load-more" onClick={onLoadMore} disabled={loading}>{loading ? copy.history.loading : copy.history.loadMore}</button>}
  </section>;
}
