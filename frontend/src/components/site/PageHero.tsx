import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { Rule } from '../ui/Rule';
import styles from './PageHero.module.css';

export type Crumb = { label: string; to?: string };

type PageHeroProps = {
  rule: string;
  /** The H1. May contain one AccentText. */
  title: ReactNode;
  lead?: string;
  /** Last item is the current page and has no `to`. */
  breadcrumb: Crumb[];
  /** Service detail variant: arch photo beside the text from 700px. Empty `alt` marks it decorative. */
  photo?: { src: string; alt: string };
};

export function PageHero({ rule, title, lead, breadcrumb, photo }: PageHeroProps) {
  const { t } = useTranslation('site');
  return (
    <section className={cx(styles.hero, photo && styles.withPhoto)}>
      <div className={cx('container', styles.inner)}>
        <div className={styles.text}>
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
                    {!last && (
                      <span className={styles.sep} aria-hidden="true">
                        /
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <Rule>{rule}</Rule>
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {photo && (
          <img
            className={styles.photo}
            src={photo.src}
            alt={photo.alt}
            decoding="async"
          />
        )}
      </div>
    </section>
  );
}
