import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CachedVisit } from '../offline/db';
import { elapsed, formatElapsed, formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';

type Props = { visit: CachedVisit; photosEnabled: boolean; onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void };
export function VisitCard({ visit, photosEnabled, onArrive, onLeave, onNote, onPhoto }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (visit.status !== 'in_progress') return; const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, [visit.status]);
  const activeStart = visit.check_in_at ?? visit.scheduled_start;
  return <article className={`visit-card visit-card--${visit.status}`}>
    <div className="visit-card-heading"><p className="visit-time">{formatKampala(visit.scheduled_start)} – {formatKampala(visit.scheduled_end)}</p><span className={`status-chip status-chip--${visit.status}`}>{visitStatusLabel(visit.status)}</span></div>
    <h3>{visit.client_display_name}</h3>
    <p>{visit.place_address_text || copy.address.missingOffline}</p>
    {visit.instructions && <p>{visit.instructions}</p>}
    {visit.status === 'in_progress' && <p className="active-marker">{formatElapsed(elapsed(activeStart, now) * 1000)}</p>}
    <div className="visit-card-actions">
      <Link to={visit.status === 'in_progress' ? `/active/${encodeURIComponent(visit.id)}` : `/visit/${encodeURIComponent(visit.id)}`}>{copy.generic.viewDetails}</Link>
      {visit.status === 'scheduled' && <button type="button" onClick={() => onArrive(visit)}>{copy.visit.arrive}</button>}
      {visit.status === 'in_progress' && <button type="button" onClick={() => onLeave(visit)}>{copy.visit.leave}</button>}
      <button type="button" className="button-secondary" onClick={() => onNote(visit)}>{copy.visit.note}</button>
      {photosEnabled && visit.photo_rules?.allowed && <button type="button" className="button-secondary" onClick={() => onPhoto(visit)}>{copy.visit.photo}</button>}
    </div>
  </article>;
}
