import { Link } from 'react-router-dom';
import type { CachedVisit } from '../offline/db';
import { formatKampalaTime } from '../lib/time';
import { copy } from '../copy';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';
import { Icon } from '../ui/Icon';
import { Timer } from '../ui/Timer';
import { statusKind, statusText } from '../ui/statusChip';

type Props = { visit: CachedVisit; onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void; photosEnabled: boolean; embedded?: boolean };
export function ActiveVisit({ visit, onNote, onPhoto, onLeave, photosEnabled, embedded = false }: Props) {
  const start = visit.check_in_at ?? visit.scheduled_start;
  const photoCount = Math.max(0, visit.photo_count ?? 0);
  const Heading = embedded ? 'h2' : 'h1';
  return <section className={`screen active-visit-screen mk-active-visit${embedded ? ' mk-active-visit--embedded' : ''}`} aria-labelledby="active-visit-title">
    <header className="active-visit-heading mk-detail-heading">
      <div><p className="eyebrow">{copy.active.eyebrow}</p><Heading id="active-visit-title">{visit.client_display_name}</Heading><p>{copy.active.arrived} {formatKampalaTime(start)} · {visit.verification_label || copy.history.verified}</p></div>
      <div className="mk-active-badges">
        <Chip kind={statusKind(visit.status, visit.verification_label)}>{statusText(visit.status, visit.verification_label)}</Chip>
        {visit.safety_timer_until && <Chip kind="pg">{copy.active.safetyTimer} · {formatSafetyDeadline(visit.safety_timer_until)}</Chip>}
      </div>
    </header>
    {visit.place_address_text && <p className="mk-active-address"><Icon name="pin" />{visit.place_address_text}</p>}
    {visit.instructions && <Card className="mk-active-instructions"><p className="eyebrow">{copy.visit.instructions}</p><p>{visit.instructions}</p></Card>}
    <div className="mk-timer-panel"><Timer startedAt={start} size="lg" /><p>{copy.active.timerExplanation}</p></div>
    {photosEnabled && visit.photo_rules?.allowed && <Card className="panel active-section mk-active-section">
      <div className="mk-section-title"><p className="eyebrow">{copy.active.photosTitle} ({photoCount} of 5)</p></div>
      <div className="photo-strip mk-photo-strip">
        {Array.from({ length: Math.min(photoCount, 2) }, (_, index) => <span key={index} className="photo-thumb" aria-label={`${copy.photos.registeredPhoto} ${index + 1}`}><Icon name="check" /></span>)}
        {photoCount < 5 && <button type="button" className="photo-add mk-photo-add" onClick={() => onPhoto(visit)}><Icon name="plus" /><span>{copy.active.addPhoto}</span></button>}
      </div>
    </Card>}
    <Card className="panel active-section mk-active-section">
      <p className="eyebrow">{copy.active.quickNoteTitle}</p>
      <button type="button" className="quick-note-input mk-quick-note" onClick={() => onNote(visit)}>{copy.active.quickNotePlaceholder}</button>
      <PillButton tone="ghost" showArrow={false} onClick={() => onNote(visit)}>{copy.active.addNote}</PillButton>
    </Card>
    <div className="detail-primary-action mk-detail-actions"><PillButton tone="forest" onClick={() => onLeave(visit)}>{copy.active.leave}</PillButton></div>
    {embedded
      ? <Link className="mk-pane-open" to={`/active/${encodeURIComponent(visit.id)}`}>{copy.active.openFullView}<Icon name="arrow-up-right" /></Link>
      : <Link className="active-back" to={`/visit/${encodeURIComponent(visit.id)}`}><Icon name="arrow-left" />{copy.active.back}</Link>}
  </section>;
}

function formatSafetyDeadline(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
