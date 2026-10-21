import { Link } from 'react-router-dom';
import type { ServicePublic } from '../../types';
import styles from './ServiceCard.module.css';
import { serviceIcon } from './serviceIcons';

type ServiceCardProps = {
  service: ServicePublic;
  /** Photo URL when the service has one. The API gives only `photo_media_id`, so the page resolves it. */
  photoUrl?: string | null;
};

/** Link card for the Services overview (spec 4.9). Photo when set, otherwise an icon tile. */
export function ServiceCard({ service, photoUrl }: ServiceCardProps) {
  const icon = serviceIcon(service.icon_key, service.slug);
  return (
    <Link to={`/services/${service.slug}`} className={styles.card}>
      <span className={styles.thumb}>
        {photoUrl ? (
          <img
            className={styles.photo}
            src={photoUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={styles.tile} data-testid="service-tile">
            {icon ?? <span className={styles.number}>{service.number}</span>}
          </span>
        )}
      </span>
      <span className={styles.body}>
        <h3 className={styles.name}>{service.name}</h3>
        {service.summary && <span className={styles.summary}>{service.summary}</span>}
      </span>
    </Link>
  );
}
