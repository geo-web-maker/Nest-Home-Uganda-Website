import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CachedVisit } from '../offline/db';
import { elapsed, formatElapsed, formatKampala } from '../lib/time';
import { copy } from '../copy';

type Props = { visit: CachedVisit; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; photosEnabled: boolean };
export function ActiveVisit({ visit, onNote, onPhoto, onLeave, photosEnabled }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const start = visit.check_in_at ?? visit.scheduled_start;
  return <section className="screen" aria-labelledby="active-visit-title">
    <Link to={`/visit/${encodeURIComponent(visit.id)}`}>{copy.active.back}</Link>
    <article className="panel active-visit-panel">
      <p className="eyebrow">{copy.active.eyebrow}</p><h2 id="active-visit-title">{visit.client_display_name}</h2>
      <p className="elapsed-timer" aria-live="off">{formatElapsed(elapsed(start, now) * 1000)}</p>
      <p>{copy.active.arrived} {formatKampala(start)}. {copy.active.timerExplanation}</p>
      <div className="visit-detail-actions"><button type="button" onClick={() => onNote(visit)}>{copy.visit.note}</button>{photosEnabled && visit.photo_rules?.allowed && <button type="button" className="button-secondary" onClick={() => onPhoto(visit)}>{copy.visit.photo}</button>}<button type="button" onClick={() => onLeave(visit)}>{copy.active.leave}</button></div>
    </article>
  </section>;
}
