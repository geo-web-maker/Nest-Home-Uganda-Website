import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import { Logo } from '../brand/Logo';
import styles from './Footer.module.css';

const EXPLORE = [
  { to: '/services', label: 'common:nav.services' },
  { to: '/how-it-works', label: 'common:nav.howItWorks' },
  { to: '/faq', label: 'site:footer.faq' },
  { to: '/areas', label: 'site:footer.areas' },
] as const;
const COMPANY = [
  { to: '/about', label: 'site:footer.aboutUs' },
  { to: '/team', label: 'site:footer.ourTeam' },
  { to: '/careers', label: 'common:nav.careers' },
  { to: '/contact', label: 'common:nav.contact' },
  { to: '/privacy', label: 'site:footer.privacy' },
] as const;
function isCurrent(to: string, path: string) {
  return path === to || (to === '/services' && path.startsWith('/services/')) || (to === '/careers' && path.startsWith('/careers/'));
}
export function Footer() {
  const { t } = useTranslation(['common', 'site']);
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const { phone, office } = site.business;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;
  return (
    <footer className={`${styles.footer} on-strong`}>
      <div className={`container ${styles.columns}`}>
        <section className={styles.brandBlock}>
          <Link to="/" className={styles.brand}>
            <Logo name={t('site:brand.name')} subtitle={t('site:brand.subtitle')} />
          </Link>
          <p className={styles.tagline}>{t('site:footer.tagline')}</p>
          <p className={styles.contactLine}>{t('site:footer.office', { office })}</p>
          <a href={tel} className={styles.phone}>{phone}</a>
        </section>
        <nav aria-labelledby="footer-explore">
          <h2 id="footer-explore" className={styles.heading}>{t('site:footer.exploreHeading')}</h2>
          <ul className={styles.list}>{EXPLORE.map((item) => <li key={item.to}><Link to={item.to} aria-current={isCurrent(item.to, pathname) ? 'page' : undefined}>{t(item.label)}</Link></li>)}</ul>
        </nav>
        <nav aria-labelledby="footer-company">
          <h2 id="footer-company" className={styles.heading}>{t('site:footer.companyHeading')}</h2>
          <ul className={styles.list}>{COMPANY.map((item) => <li key={item.to}><Link to={item.to} aria-current={isCurrent(item.to, pathname) ? 'page' : undefined}>{t(item.label)}</Link></li>)}</ul>
        </nav>
      </div>
      <p className={styles.legal}>{t('site:footer.copyright')}</p>
    </footer>
  );
}
