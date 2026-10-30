import { Link } from 'react-router-dom';
import type { CachedVisit } from '../offline/db';
import { formatKampalaTime } from '../lib/time';
import { copy } from '../copy';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Timer } from '../ui/Timer';
import { statusKind, statusText } from '../ui/statusChip';

type Props = {
  visit: CachedVisit;
  photosEnabled: boolean;
  selected?: boolean;
  onArrive: (visit: CachedVisit) => void;
  onLeave: (visit: CachedVisit) => void;
  onNote: (visit: CachedVisit) => void;
  onPhoto: (visit: CachedVisit) => void;
};

/** A schedule item is one navigable surface; actions live on its detail screen. */
export function VisitCard({ visit, selected = false }: Props) {
  const href = visit.status === 'in_progress'
    ? `/active/${encodeURIComponent(visit.id)}`
    : `/visit/${encodeURIComponent(visit.id)}`;
  const start = visit.check_in_at ?? visit.scheduled_start;
  const status = statusText(visit.status, visit.verification_label);
  return (
    <Link to={href} className="visit-card-link" aria-label={`${visit.client_display_name}, ${status}, ${formatKampalaTime(visit.scheduled_start)}`}>
      <article className={`mk-card mk-card--link visit-card visit-card--${visit.status}${visit.status === 'in_progress' ? ' mk-card--hot' : ''}${selected ? ' is-selected' : ''}`}>
        <div className="mk-card__in">
          <div className="visit-card-heading">
            <p className="visit-time">{formatKampalaTime(visit.scheduled_start)} – {formatKampalaTime(visit.scheduled_end)}</p>
            <Chip kind={statusKind(visit.status, visit.verification_label)}>{status}</Chip>
          </div>
          <h3>{visit.client_display_name}</h3>
          <p className="visit-address"><Icon name="pin" />{visit.place_address_text || copy.address.missingOffline}</p>
          {/* Distance is intentionally omitted: cached visits do not contain a reliable route distance. */}
          {visit.status === 'in_progress' && <div className="visit-card-timer"><Timer startedAt={start} size="sm" /><span>{copy.active.arrived}</span></div>}
          <span className="visit-card-open" aria-hidden="true"><Icon name="arrow-up-right" /></span>
        </div>
      </article>
    </Link>
  );
}
