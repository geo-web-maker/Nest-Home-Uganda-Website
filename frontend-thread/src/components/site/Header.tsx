import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { normaliseUgPhone } from '../../lib/phone';
import { useSiteSettings } from '../../lib/queries/site';
import { Button } from '../ui/Button';
import { Logo } from '../brand/Logo';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

const NAV = [
  { to: '/services', key: 'common:nav.services' },
  { to: '/how-it-works', key: 'common:nav.howItWorks' },
  { to: '/about', key: 'site:footer.aboutUs' },
  { to: '/faq', key: 'site:header.faq' },
  { to: '/contact', key: 'common:nav.contact' },
] as const;

function current(to: string, pathname: string) {
  return pathname === to || (to === '/services' && pathname.startsWith('/services/'));
}

export function Header() {
  const { t } = useTranslation(['common', 'site']);
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const isOpen = openAt === pathname;
  const phone = site.business.phone;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;

  useEffect(() => {
    setEnhanced(true);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        header.style.setProperty('--scroll-progress', `${Math.min(1, window.scrollY / max)}`);
        header.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    setOpenAt(null);
  }, [pathname]);

  const closeOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      setOpenAt(null);
      menuRef.current?.focus();
    }
  };

  return (
    <header ref={headerRef} className={styles.header} data-enhanced={enhanced ? 'true' : 'false'} onKeyDown={closeOnEscape}>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand} aria-label={t('site:brand.name')}>
          <Logo name={t('site:brand.name')} subtitle={t('site:brand.subtitle')} />
        </Link>
        <nav
          id="site-nav"
          className={`${styles.nav} ${isOpen ? styles.navOpen : ''}`}
          aria-label={t('site:header.mainNav')}
          data-open={isOpen ? 'true' : 'false'}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenAt(null);
          }}
        >
          <ul className={styles.list}>
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={styles.link}
                  aria-current={current(item.to, pathname) ? 'page' : undefined}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.actions}>
          <ThemeToggle label={t('common:theme.label')} />
          <Button href={tel} size="header" className={styles.callButton}>
            {t('common:actions.call')} <span className={styles.phone}>{phone}</span>
          </Button>
          <button
            ref={menuRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={isOpen}
            aria-controls="site-nav"
            aria-label={t('common:actions.menu')}
            onClick={() => setOpenAt(isOpen ? null : pathname)}
          >
            <span aria-hidden="true">{isOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </div>
      <span className={styles.progress} aria-hidden="true" />
    </header>
  );
}
