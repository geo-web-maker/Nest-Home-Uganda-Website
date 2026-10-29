import type { FormEvent } from 'react';
import type { CachedClient, CachedVisit } from '../offline/db';
import { Link } from 'react-router-dom';
import { copy } from '../copy';
import { VisitCard } from './VisitCard';

type Props = {
  visits: CachedVisit[]; clients: CachedClient[]; adhocAllowed: boolean; adhocOpen: boolean; adhocClientId: string;
  photosEnabled: boolean; pendingPhotoCount: number; loading: boolean;
  onAdhocOpen: () => void; onAdhocClient: (id: string) => void; onStartAdhoc: (event: FormEvent) => void; onSync: () => void;
  onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void;
};
export function TodayScreen(props: Props) {
  const ordered = [...props.visits].sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));
  return <section className="screen" aria-labelledby="today-heading">
    <div className="screen-heading"><div><p className="eyebrow">{copy.today.eyebrow}</p><h2 id="today-heading">{copy.today.heading}</h2></div><button type="button" className="button-secondary" onClick={props.onSync} disabled={props.loading}>{props.loading ? copy.today.syncing : copy.today.refresh}</button></div>
    {props.adhocAllowed && <section className="adhoc-launch"><button type="button" aria-expanded={props.adhocOpen} onClick={props.onAdhocOpen}>{copy.today.adhocOpen}<span aria-hidden="true">→</span></button></section>}
    {props.adhocOpen && <div className="sheet-backdrop" role="presentation"><section className="sheet adhoc-sheet" role="dialog" aria-modal="true" aria-labelledby="adhoc-title"><div className="sheet-handle" aria-hidden="true" /><h2 id="adhoc-title">Who did you visit?</h2><p>Choose from your own clients. No typing.</p><form onSubmit={props.onStartAdhoc}><div className="adhoc-options">{props.clients.map((client) => <label key={client.id}><input type="radio" name="adhoc-client" value={client.id} checked={props.adhocClientId === client.id} onChange={(event) => props.onAdhocClient(event.target.value)} /><span>{client.display_name}</span></label>)}</div><p className="notice info">Your supervisor will review unscheduled visits.</p><div className="sheet-actions"><button type="submit" disabled={!props.adhocClientId}>{copy.today.startVisit}<span aria-hidden="true">→</span></button><button type="button" className="button-secondary" onClick={props.onAdhocOpen}>{copy.generic.cancel}</button></div></form></section></div>}
    {props.pendingPhotoCount > 20 && <p role="status" className="notice">{copy.today.photoQueueWarning}</p>}
    {ordered.length === 0 ? <div className="empty-state"><h3>{copy.visit.empty}</h3><p>{copy.today.emptyHint}</p><button type="button" onClick={props.onSync}>{copy.generic.syncSchedule}</button></div> : (
      <div className="today-workspace">
        <div className="today-schedule">
          <h3 className="schedule-label">Visit schedule</h3>
          <div className="visit-list">{ordered.map((visit) => <VisitCard key={visit.id} visit={visit} photosEnabled={props.photosEnabled} onArrive={props.onArrive} onLeave={props.onLeave} onNote={props.onNote} onPhoto={props.onPhoto} />)}</div>
        </div>
        {(() => {
          const activeVisit = ordered.find((visit) => visit.status === 'in_progress');
          if (!activeVisit) return null;
          return (
            <aside className="today-current-panel" aria-label="Current visit">
              <p className="eyebrow">Current visit</p>
              <h3 id="current-visit-heading">{activeVisit.client_display_name}</h3>
              <p className="current-visit-address">{activeVisit.place_address_text || 'Address not provided'}</p>
              <div className="current-visit-state"><span className="status-chip status-chip--in_progress">In progress</span><span>Check-in recorded</span></div>
              {activeVisit.instructions && <div className="current-visit-instructions"><strong>Visit instructions</strong><p>{activeVisit.instructions}</p></div>}
              <Link className="current-visit-link" to={`/active/${activeVisit.id}`}>Continue active visit <span aria-hidden="true">→</span></Link>
            </aside>
          );
        })()}
      </div>
    )}
    <p className="privacy-hint">{copy.visit.locationHint}</p>
  </section>;
}
