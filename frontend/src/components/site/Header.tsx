import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { normaliseUgPhone } from '../../lib/phone';
import { useServices } from '../../lib/queries/services';
import { useSiteSettings } from '../../lib/queries/site';
import { cx } from '../../lib/cx';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/Button';
import styles from './Header.module.css';

const NAV = [
  { to: '/about', key: 'about' },
  { to: '/how-it-works', key: 'howItWorks' },
  { to: '/careers', key: 'careers' },
  { to: '/contact', key: 'contact' },
] as const;

export function Header() {
  const { t } = useTranslation(['common', 'site']);
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const { data: services } = useServices();
  // Each menu remembers the path it was opened on, so a route change closes it without an effect.
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const [servicesAt, setServicesAt] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pointerDown = useRef(false);
  const headerRef = useRef<HTMLElement>(null);

  // Scrolled shadow: one passive listener that sets an attribute, so there is no React state per scroll.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      el.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  const menuOpen = menuAt === pathname;
  const servicesOpen = servicesAt === pathname;
  const phone = site.business.phone;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (servicesOpen) triggerRef.current?.focus();
    setServicesAt(null);
    setMenuAt(null);
  }

  return (
    <header ref={headerRef} className={styles.header} onKeyDown={onKeyDown}>
      <div className={cx('container', styles.inner)}>
        <Link
          to="/"
          className={styles.brand}
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          <Logo name={t('site:brand.name')} subtitle={t('site:brand.subtitle')} />
        </Link>

        <nav
          id="site-nav"
          aria-label={t('site:header.mainNav')}
          className={cx(styles.nav, menuOpen && styles.navOpen)}
          data-open={menuOpen}
        >
          <ul className={styles.list}>
            <li
              className={cx(styles.hasMenu, servicesOpen && styles.menuOpen)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setServicesAt(null);
              }}
            >
              <button
                ref={triggerRef}
                type="button"
                className={styles.link}
                aria-expanded={servicesOpen}
                aria-haspopup="true"
                aria-controls="services-menu"
                onPointerDown={() => {
                  pointerDown.current = true;
                }}
                onFocus={() => {
                  // Keyboard focus opens the menu; a mouse press is handled by onClick instead.
                  if (!pointerDown.current) setServicesAt(pathname);
                  pointerDown.current = false;
                }}
                onClick={() => setServicesAt(servicesOpen ? null : pathname)}
              >
                {t('common:nav.services')}
              </button>
              <ul id="services-menu" className={styles.menu}>
                <li>
                  <Link
                    to="/services"
                    className={styles.menuLink}
                    aria-current={pathname === '/services' ? 'page' : undefined}
                  >
                    {t('common:nav.services')}
                  </Link>
                </li>
                {services?.map((service) => (
                  <li key={service.id}>
                    <Link
                      to={`/services/${service.slug}`}
                      className={styles.menuLink}
                      aria-current={
                        pathname === `/services/${service.slug}` ? 'page' : undefined
                      }
                    >
                      {service.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  className={styles.link}
                  aria-current={pathname === item.to ? 'page' : undefined}
                >
                  {t(`common:nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <Button href={tel} size="header">
            {t('common:actions.call')}
          </Button>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            aria-label={t('common:actions.menu')}
            onClick={() => setMenuAt(menuOpen ? null : pathname)}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>
    </header>
  );
}
