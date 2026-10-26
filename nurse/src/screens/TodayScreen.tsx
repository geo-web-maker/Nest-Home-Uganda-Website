import type { FormEvent } from 'react';
import type { CachedClient, CachedVisit } from '../offline/db';
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
    {props.adhocAllowed && <section className="panel compact-panel"><button type="button" aria-expanded={props.adhocOpen} onClick={props.onAdhocOpen}>{copy.today.adhocOpen}</button>
      {props.adhocOpen && <form onSubmit={props.onStartAdhoc} className="stack-form"><label htmlFor="adhoc-client">{copy.today.assignedClient}</label><select id="adhoc-client" value={props.adhocClientId} onChange={(event) => props.onAdhocClient(event.target.value)} required><option value="">{copy.today.chooseClient}</option>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.display_name}</option>)}</select><p>{copy.today.adhocExplanation}</p><div className="inline-actions"><button type="submit" disabled={!props.adhocClientId}>{copy.today.startVisit}</button><button type="button" className="button-secondary" onClick={props.onAdhocOpen}>{copy.generic.cancel}</button></div></form>}
    </section>}
    {props.pendingPhotoCount > 20 && <p role="status" className="notice">{copy.today.photoQueueWarning}</p>}
    {ordered.length === 0 ? <div className="empty-state"><h3>{copy.visit.empty}</h3><p>{copy.today.emptyHint}</p><button type="button" onClick={props.onSync}>{copy.generic.syncSchedule}</button></div> : <div className="visit-list">{ordered.map((visit) => <VisitCard key={visit.id} visit={visit} photosEnabled={props.photosEnabled} onArrive={props.onArrive} onLeave={props.onLeave} onNote={props.onNote} onPhoto={props.onPhoto} />)}</div>}
    <p className="privacy-hint">{copy.visit.locationHint}</p>
  </section>;
}
