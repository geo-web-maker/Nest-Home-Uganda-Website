import { Link } from 'react-router-dom';
import type { ServicePublic } from '../../types';
import { cx } from '../../lib/cx';
import styles from './ServiceCard.module.css';
import { serviceIcon } from './serviceIcons';

type ServiceCardProps = {
  service: ServicePublic;
  /** Photo URL when the service has one. The API gives only `photo_media_id`, so the page resolves it. */
  photoUrl?: string | null;
  /** Optional "ask about this" WhatsApp button, shown on the right of the row. */
  /** Smaller bordered card for "related" lists. */
  compact?: boolean;
  ask?: { href: string; label: string; text: string; onClick?: () => void };
};

/**
 * One service row (the template's `svc`): arch photo, gold number, name, summary, and an optional
 * WhatsApp ask button. The whole row opens the service page through the name link.
 */
export function ServiceCard({ service, photoUrl, ask, compact = false }: ServiceCardProps) {
  const icon = serviceIcon(service.icon_key, service.slug);
  return (
    <div className={cx(styles.card, compact && styles.compact, !photoUrl && styles.noPhoto)}>
      <span className={styles.thumb} aria-hidden={photoUrl ? undefined : 'true'}>
        {photoUrl ? (
          <img className={styles.photo} src={photoUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.tile} data-testid="service-tile" aria-hidden="true">
            {icon ?? <span className={styles.diamond}>{service.number}</span>}
          </span>
        )}
      </span>
      <div className={styles.body}>
        <span className={styles.number} aria-hidden="true">{String(service.number).padStart(2, '0')}</span>
        <h3 className={styles.name}>
          <Link to={`/services/${service.slug}`} className={styles.link}>{service.name}</Link>
        </h3>
        {service.summary && <span className={styles.summary}>{service.summary}</span>}
      </div>
      {ask && (
        <a className={styles.ask} href={ask.href} target="_blank" rel="noopener noreferrer" aria-label={ask.label} onClick={ask.onClick}>
          {ask.text}
        </a>
      )}
    </div>
  );
}
