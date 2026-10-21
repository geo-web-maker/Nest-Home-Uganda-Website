import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import styles from './Footer.module.css';

const EXPLORE = [
  { to: '/services', label: 'common:nav.services' },
  { to: '/team', label: 'site:footer.ourTeam' },
  { to: '/areas', label: 'site:footer.areas' },
  { to: '/faq', label: 'site:footer.faq' },
] as const;

const COMPANY = [
  { to: '/about', label: 'site:footer.aboutUs' },
  { to: '/careers', label: 'common:nav.careers' },
  { to: '/contact', label: 'common:nav.contact' },
  { to: '/privacy', label: 'site:footer.privacy' },
] as const;

export function Footer() {
  const { t } = useTranslation(['common', 'site']);
  const { data: site } = useSiteSettings();
  const { phone, office } = site.business;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;

  return (
    <footer className={styles.footer}>
      <div className={cx('container', styles.columns)}>
        <section>
          <h2 className={styles.heading}>{t('site:brand.name')}</h2>
          <p>{t('site:footer.tagline')}</p>
          <p>
            {t('site:footer.office', { office })} ·{' '}
            <a href={tel} className={styles.link}>
              {phone}
            </a>
          </p>
        </section>
        <nav aria-labelledby="footer-explore">
          <h2 id="footer-explore" className={styles.heading}>
            {t('site:footer.exploreHeading')}
          </h2>
          <ul className={styles.list}>
            {EXPLORE.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.link}>
                  {t(item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="footer-company">
          <h2 id="footer-company" className={styles.heading}>
            {t('site:footer.companyHeading')}
          </h2>
          <ul className={styles.list}>
            {COMPANY.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.link}>
                  {t(item.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className={styles.legal}>{t('site:footer.copyright')}</p>
    </footer>
  );
}
