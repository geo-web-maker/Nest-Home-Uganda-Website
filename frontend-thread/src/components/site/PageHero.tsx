import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { ShapeField } from '../thread/ThreadParts';
import styles from './PageHero.module.css';

export type Crumb = { label: string; to?: string };

type PageHeroProps = {
  rule: string;
  /** The H1. */
  title: ReactNode;
  lead?: string;
  /** Last item is the current page and has no `to`. */
  breadcrumb: Crumb[];
  /**
   * `page` is the mint inner-page band. `service` is the leaf green hero used on a service page:
   * the photo fills it behind a green wash, or drifting shapes when there is no photo.
   */
  variant?: 'page' | 'service';
  /** Service variant: the photo behind the hero. Empty `alt` marks it decorative. */
  photo?: { src: string; alt: string };
};

/** Inner page header (the template's `phead`) and the service hero (`hb`). */
export function PageHero({ rule, title, lead, breadcrumb, variant, photo }: PageHeroProps) {
  const { t } = useTranslation('site');
  const service = variant === 'service' || Boolean(photo);
  return (
    <section className={cx(styles.hero, service ? cx(styles.service, 'on-hero', !photo && styles.noPhoto) : styles.page)}>
      {service && photo && (
        <div className={styles.bg} aria-hidden={photo.alt ? undefined : 'true'}>
          <img src={photo.src} alt={photo.alt} decoding="async" />
        </div>
      )}
      {!photo && <ShapeField variant={service ? 'service' : 'page'} />}
      <div className={cx('container', styles.inner)}>
        <nav aria-label={t('breadcrumb.label')}>
          <ol className={styles.crumbs}>
            {breadcrumb.map((crumb, index) => {
              const last = index === breadcrumb.length - 1;
              return (
                <li key={`${index}-${crumb.label}`}>
                  {crumb.to && !last ? (
                    <Link to={crumb.to} className={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className={styles.rule}>
          <span aria-hidden="true" />
          {rule}
        </div>
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {service && (
        <svg className={styles.tw} viewBox="0 0 1440 46" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 30C160 6 300 44 480 24S800 4 960 26 1260 40 1440 14" />
        </svg>
      )}
    </section>
  );
}
