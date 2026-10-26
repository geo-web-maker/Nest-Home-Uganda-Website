import type { CachedVisit } from '../offline/db';
import { formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';
import { Link } from 'react-router-dom';

type Props = { visit: CachedVisit; photosEnabled: boolean; onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void };
export function VisitDetail({ visit, photosEnabled, onArrive, onLeave, onNote, onPhoto }: Props) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.place_address_text)}`;
  return <section className="screen" aria-labelledby="visit-detail-heading">
    <Link to="/">{copy.generic.backToToday}</Link>
    <article className="panel visit-detail">
      <div className="screen-heading"><h2 id="visit-detail-heading">{visit.client_display_name}</h2><span className={`status-chip status-chip--${visit.status}`}>{visitStatusLabel(visit.status)}</span></div>
      <p>{formatKampala(visit.scheduled_start)} – {formatKampala(visit.scheduled_end)}</p>
      <h3>{copy.visit.address}</h3><p>{visit.place_address_text || copy.address.missingOffline}</p>
      {visit.place_address_text && <a href={mapUrl} target="_blank" rel="noreferrer">{copy.generic.openMaps}</a>}
      <h3>{copy.visit.instructions}</h3><p>{visit.instructions || copy.address.noInstructions}</p>
      <p>{copy.visit.locationHint}</p>
      <div className="visit-detail-actions">
        {visit.status === 'scheduled' && <button type="button" onClick={() => onArrive(visit)}>{copy.visit.arrive}</button>}
        {visit.status === 'in_progress' && <button type="button" onClick={() => onLeave(visit)}>{copy.visit.leave}</button>}
        {visit.status === 'in_progress' && <Link to={`/active/${encodeURIComponent(visit.id)}`}>{copy.active.openActive}</Link>}
        <button type="button" className="button-secondary" onClick={() => onNote(visit)}>{copy.visit.note}</button>
        {photosEnabled && visit.photo_rules?.allowed && <button type="button" className="button-secondary" onClick={() => onPhoto(visit)}>{copy.visit.photo}</button>}
      </div>
    </article>
  </section>;
}
