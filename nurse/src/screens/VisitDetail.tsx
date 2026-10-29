import type { CachedVisit } from '../offline/db';
import { formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';
import { Link } from 'react-router-dom';

type Props = { visit: CachedVisit; photosEnabled: boolean; onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void };
export function VisitDetail({ visit, photosEnabled, onArrive, onLeave, onNote, onPhoto }: Props) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.place_address_text)}`;
  return <section className="screen visit-detail-screen" aria-labelledby="visit-detail-heading">
    <Link className="back-link" to="/">{copy.generic.backToToday}</Link>
    <header className="visit-detail-heading"><div><h1 id="visit-detail-heading">{visit.client_display_name}</h1><p>{formatKampala(visit.scheduled_start)} – {formatKampala(visit.scheduled_end)}</p></div><span className={`status-chip status-chip--${visit.status}`}>{visitStatusLabel(visit.status)}</span></header>
    <article className="panel detail-card"><p className="eyebrow">{copy.visit.address}</p><h2>{visit.place_address_text || copy.address.missingOffline}</h2>{visit.place_address_text && <a className="pill-link" href={mapUrl} target="_blank" rel="noreferrer">{copy.generic.openMaps}<span aria-hidden="true">→</span></a>}</article>
    <article className="panel detail-card"><p className="eyebrow">{copy.visit.instructions}</p><p>{visit.instructions || copy.address.noInstructions}</p></article>
    <div className="detail-primary-action">
      {visit.status === 'scheduled' && <button type="button" onClick={() => onArrive(visit)}>{copy.visit.arrive}<span aria-hidden="true">→</span></button>}
      {visit.status === 'in_progress' && <button type="button" onClick={() => onLeave(visit)}>{copy.visit.leave}<span aria-hidden="true">→</span></button>}
    </div>
    <div className="visit-secondary-actions">
      {visit.status === 'in_progress' && <Link to={`/active/${encodeURIComponent(visit.id)}`}>{copy.active.openActive}</Link>}
      <button type="button" className="button-secondary" onClick={() => onNote(visit)}>{copy.visit.note}</button>
      {photosEnabled && visit.photo_rules?.allowed && <button type="button" className="button-secondary" onClick={() => onPhoto(visit)}>{copy.visit.photo}</button>}
    </div>
  </section>;
}
