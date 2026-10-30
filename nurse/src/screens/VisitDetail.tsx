import type { CachedVisit } from '../offline/db';
import { formatKampalaTime } from '../lib/time';
import { copy } from '../copy';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';
import { Icon } from '../ui/Icon';
import { statusKind, statusText } from '../ui/statusChip';

type Props = {
  visit: CachedVisit; photosEnabled: boolean; embedded?: boolean;
  onArrive: (visit: CachedVisit) => void; onLeave: (visit: CachedVisit) => void;
  onNote: (visit: CachedVisit) => void; onPhoto: (visit: CachedVisit) => void;
};

export function VisitDetail({ visit, photosEnabled, embedded = false, onArrive, onLeave, onNote, onPhoto }: Props) {
  const mapUrl = visit.place_address_text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.place_address_text)}` : null;
  const Heading = embedded ? 'h2' : 'h1';
  return <section className={`screen visit-detail-screen mk-visit-detail${embedded ? ' mk-visit-detail--embedded' : ''}`} aria-labelledby="visit-detail-heading">
    {!embedded && <Link className="back-link" to="/">{copy.generic.backToToday}</Link>}
    <header className="visit-detail-heading mk-detail-heading">
      <div><p className="eyebrow">{copy.visit.detail}</p><Heading id="visit-detail-heading">{visit.client_display_name}</Heading><p>{formatKampalaTime(visit.scheduled_start)} – {formatKampalaTime(visit.scheduled_end)}</p></div>
      <Chip kind={statusKind(visit.status, visit.verification_label)}>{statusText(visit.status, visit.verification_label)}</Chip>
    </header>
    <Card className="panel detail-card mk-detail-card">
      <p className="eyebrow">{copy.visit.address}</p>
      <h3>{visit.place_address_text || copy.address.missingOffline}</h3>
      {mapUrl && <a className="mk-map-link" href={mapUrl} target="_blank" rel="noreferrer"><Icon name="map" />{copy.generic.openMaps}<Icon name="arrow-up-right" /></a>}
    </Card>
    <Card className="panel detail-card mk-detail-card">
      <p className="eyebrow">{copy.visit.instructions}</p><p>{visit.instructions || copy.address.noInstructions}</p>
    </Card>
    <div className="detail-primary-action mk-detail-actions">
      {visit.status === 'scheduled' && <PillButton size="full" onClick={() => onArrive(visit)}>{copy.visit.arrive}</PillButton>}
      {visit.status === 'in_progress' && <PillButton onClick={() => onLeave(visit)} tone="forest" size="full">{copy.visit.leave}</PillButton>}
    </div>
    <div className="visit-secondary-actions mk-secondary-actions">
      {visit.status === 'in_progress' && <Link to={`/active/${encodeURIComponent(visit.id)}`}>{copy.active.openActive}<Icon name="arrow-up-right" /></Link>}
      <PillButton tone="ghost" size="sm" showArrow={false} onClick={() => onNote(visit)}>{copy.visit.note}</PillButton>
      {photosEnabled && visit.photo_rules?.allowed && <PillButton tone="ghost" size="sm" showArrow={false} onClick={() => onPhoto(visit)}>{copy.visit.photo}</PillButton>}
    </div>
    {embedded && <p className="mk-pane-hint">{copy.today.paneHint}</p>}
  </section>;
}
