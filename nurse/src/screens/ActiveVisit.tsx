import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CachedVisit } from '../offline/db';
import { elapsed, formatElapsed, formatKampala } from '../lib/time';
import { copy, visitStatusLabel } from '../copy';

type Props = { visit: CachedVisit; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; photosEnabled: boolean };
export function ActiveVisit({ visit, onNote, onPhoto, onLeave, photosEnabled }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const start = visit.check_in_at ?? visit.scheduled_start;
  const photoCount = Math.max(0, visit.photo_count ?? 0);
  return <section className="screen active-visit-screen" aria-labelledby="active-visit-title">
    <header className="active-visit-heading"><div><h1 id="active-visit-title">{visit.client_display_name}</h1><p>{copy.active.arrived} {formatKampala(start)} · {visit.verification_label || 'Verified'}</p></div><span className={`status-chip status-chip--${visit.status}`}>{visitStatusLabel(visit.status)}</span></header>
    <p className="elapsed-timer" aria-live="off">{formatElapsed(elapsed(start, now) * 1000)}</p>
    <article className="panel active-section"><p className="eyebrow">Photos ({photoCount} of 5)</p><div className="photo-strip">{Array.from({ length: Math.min(photoCount, 2) }, (_, index) => <span key={index} className="photo-thumb" aria-label={`Saved photo ${index + 1}`}>✓</span>)}{photosEnabled && visit.photo_rules?.allowed && photoCount < 5 && <button type="button" className="photo-add" onClick={() => onPhoto(visit)}><span aria-hidden="true">▣</span><span>Add</span></button>}</div></article>
    <article className="panel active-section"><p className="eyebrow">Quick note</p><button type="button" className="quick-note-input" onClick={() => onNote(visit)}>Write a short note</button><button type="button" className="quick-note-action button-secondary" onClick={() => onNote(visit)}>Add note <span aria-hidden="true">→</span></button></article>
    <div className="detail-primary-action"><button type="button" onClick={() => onLeave(visit)}>{copy.active.leave}<span aria-hidden="true">→</span></button></div>
    <Link className="active-back" to={`/visit/${encodeURIComponent(visit.id)}`}>{copy.active.back}</Link>
  </section>;
}
