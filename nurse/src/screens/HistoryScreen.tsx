import type { CachedHistoryVisit } from '../offline/db';
import { formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';

type Props = { history: CachedHistoryVisit[]; loading: boolean; hasMore: boolean; onLoadMore: () => void };
export function HistoryScreen({ history, loading, hasMore, onLoadMore }: Props) {
  const groups = new Map<string, CachedHistoryVisit[]>();
  for (const visit of history) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(visit.scheduled_start));
    groups.set(date, [...(groups.get(date) ?? []), visit]);
  }
  return <section className="screen" aria-labelledby="history-heading"><div className="screen-heading"><div><p className="eyebrow">{copy.history.eyebrow}</p><h2 id="history-heading">{copy.history.title}</h2></div></div>
    {history.length === 0 && <div className="empty-state"><h3>{copy.history.noHistory}</h3><p>{copy.history.empty}</p></div>}
    {[...groups.entries()].map(([date, items]) => <section className="history-group" key={date}><h3>{date}</h3>{items.map((item) => <article className="visit-card history-card" key={item.id}><div className="visit-card-heading"><strong>{formatKampala(item.scheduled_start)}</strong><span className={`status-chip status-chip--${item.status}`}>{visitStatusLabel(item.status)}</span></div><p>{copy.history.end} {formatKampala(item.scheduled_end)}</p><p className="muted">{copy.history.reference} {item.id}</p></article>)}</section>)}
    {hasMore && <button type="button" onClick={onLoadMore} disabled={loading}>{loading ? copy.history.loading : copy.history.loadMore}</button>}
  </section>;
}
