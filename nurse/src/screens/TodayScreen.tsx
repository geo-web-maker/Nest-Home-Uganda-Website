import type { FormEvent } from 'react';
import type { CachedClient, CachedVisit } from '../offline/db';
import { formatKampalaTime } from '../lib/time';
import { Link } from 'react-router-dom';
import { copy } from '../copy';
import { VisitCard } from './VisitCard';
import { ActiveVisit } from './ActiveVisit';
import { VisitDetail } from './VisitDetail';
import { greeting, greetingDate, initials } from '../ui/greeting';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { Row } from '../ui/Row';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';
import { MapPlaceholder } from '../ui/MapPlaceholder';
import { Banner } from '../ui/Banner';

type Props = {
  visits: CachedVisit[]; clients: CachedClient[]; adhocAllowed: boolean; adhocOpen: boolean; adhocClientId: string;
  photosEnabled: boolean; pendingPhotoCount: number; loading: boolean; displayName?: string | null; staffNumber?: string | null;
  onAdhocOpen: () => void; onAdhocClient: (id: string) => void; onStartAdhoc: (event: FormEvent) => void; onSync: () => void;
  onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void;
};

export function TodayScreen(props: Props) {
  const ordered = [...props.visits].sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));
  const activeVisit = ordered.find((visit) => visit.status === 'in_progress');
  const nextVisit = ordered.find((visit) => visit.status === 'scheduled');
  const completedCount = ordered.filter((visit) => visit.status === 'completed').length;
  const paneVisit = activeVisit ?? nextVisit ?? ordered[0];
  const firstName = props.displayName?.trim().split(/\s+/)[0];
  const greetingText = greeting(new Date());
  const mapAddress = paneVisit?.place_address_text || '';

  return <section className="screen mk-today" aria-labelledby="today-heading">
    <div className="mk-today__list">
      <header className="mk-greeting">
        <div className="mk-greeting__text">
          <p className="eyebrow">{greetingDate(new Date())}</p>
          <h1 id="today-heading">{greetingText}{firstName ? <>, <em>{firstName}</em></> : ''}</h1>
          <p className="mk-greeting__sub">{copy.today.eyebrow}</p>
        </div>
        <div className="mk-greeting__actions">
          <Avatar initials={initials(props.displayName, props.staffNumber)} label={props.displayName || undefined} />
          <button type="button" className="mk-icon-button" onClick={props.onSync} disabled={props.loading} aria-label={props.loading ? copy.today.syncing : copy.today.refresh}>
            <Icon name="sync" />
          </button>
        </div>
      </header>

      <div className="mk-schedule-heading"><h2>{copy.today.scheduleHeading}</h2></div>
      {props.pendingPhotoCount > 20 && <Banner tone="warn">{copy.today.photoQueueWarning}</Banner>}

      {ordered.length === 0 ? <Card className="empty-state mk-empty-state">
        <div className="mk-empty-icon"><Icon name="today" /></div>
        <h3>{copy.visit.empty}</h3><p>{copy.today.emptyHint}</p>
        <PillButton onClick={props.onSync} disabled={props.loading} size="full">{copy.generic.syncSchedule}</PillButton>
      </Card> : <div className="visit-list mk-visit-list">{ordered.map((visit) => <VisitCard key={visit.id} visit={visit} selected={paneVisit?.id === visit.id} photosEnabled={props.photosEnabled} onArrive={props.onArrive} onLeave={props.onLeave} onNote={props.onNote} onPhoto={props.onPhoto} />)}</div>}
      {props.adhocAllowed && <div className="adhoc-launch mk-adhoc-launch"><PillButton type="button" tone="ghost" size="sm" onClick={props.onAdhocOpen} aria-expanded={props.adhocOpen}>{copy.today.adhocOpen}</PillButton></div>}
      <p className="privacy-hint">{copy.visit.locationHint}</p>
    </div>

    {paneVisit && <aside className={`mk-today__pane${activeVisit ? ' mk-today__pane--active' : ''}`} aria-label={activeVisit ? copy.today.currentVisitLandmark : copy.today.selectedVisitLandmark}>
      {activeVisit
        ? <ActiveVisit visit={activeVisit} onNote={props.onNote} onPhoto={props.onPhoto} onLeave={props.onLeave} photosEnabled={props.photosEnabled} embedded />
        : <VisitDetail visit={paneVisit} photosEnabled={props.photosEnabled} onArrive={props.onArrive} onLeave={props.onLeave} onNote={props.onNote} onPhoto={props.onPhoto} embedded />}
    </aside>}

    <aside className="mk-today__side" aria-label={copy.today.summaryLandmark}>
      <Card className="mk-summary-card">
        <h2>{copy.today.summaryTitle}</h2>
        <div className="mk-summary-grid">
          <div><strong>{ordered.length}</strong><span>{copy.today.visitsLabel}</span></div>
          <div><strong>{completedCount}</strong><span>{copy.today.doneLabel}</span></div>
        </div>
        <Row icon={<Icon name="clock" />} label={copy.today.nextLabel} value={nextVisit ? `${formatKampalaTime(nextVisit.scheduled_start)} · ${nextVisit.client_display_name}` : copy.today.noneScheduled} />
        {activeVisit && <Row icon={<Icon name="check" />} label={copy.today.activeLabel} value={<Chip kind="pg">{copy.active.eyebrow}</Chip>} />}
      </Card>
      <MapPlaceholder title={copy.today.mapTitle} subtitle={mapAddress || copy.address.missingOffline} />
      <Link to="/history" className="mk-side-link">{copy.today.historyLink}<Icon name="arrow-up-right" /></Link>
    </aside>

    {props.adhocOpen && <div className="sheet-backdrop" role="presentation"><section className="sheet adhoc-sheet" role="dialog" aria-modal="true" aria-labelledby="adhoc-title"><div className="sheet-handle" aria-hidden="true" /><h2 id="adhoc-title">{copy.today.adhocQuestion}</h2><p>{copy.today.adhocExplanation}</p><form onSubmit={props.onStartAdhoc}><div className="adhoc-options">{props.clients.map((client) => <label key={client.id}><input type="radio" name="adhoc-client" value={client.id} checked={props.adhocClientId === client.id} onChange={(event) => props.onAdhocClient(event.target.value)} /><span>{client.display_name}</span></label>)}</div><Banner tone="info">{copy.today.adhocReviewNotice}</Banner><div className="sheet-actions"><PillButton type="submit" disabled={!props.adhocClientId}>{copy.today.startVisit}</PillButton><PillButton type="button" tone="ghost" onClick={props.onAdhocOpen}>{copy.generic.cancel}</PillButton></div></form></section></div>}
  </section>;
}

