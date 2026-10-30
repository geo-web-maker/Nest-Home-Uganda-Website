import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { normaliseUgPhone } from '../../lib/phone';
import { useServices } from '../../lib/queries/services';
import { useSiteSettings } from '../../lib/queries/site';
import { cx } from '../../lib/cx';
import { Logo } from '../brand/Logo';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

type MenuId = 'services' | 'about';

interface MenuItem {
  to: string;
  label: string;
}

interface NavMenuProps {
  id: MenuId;
  label: string;
  items: MenuItem[];
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A top-level trigger with an expandable sub-list: indented in the phone panel, a dropdown on desktop. */
function NavMenu({ id, label, items, pathname, open, onOpenChange }: NavMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pointerDown = useRef(false);
  const menuId = `${id}-menu`;
  const groupCurrent = items.some((item) => item.to === pathname);

  return (
    <li
      className={cx(styles.hasMenu, open && styles.menuOpen)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        triggerRef.current?.focus();
        onOpenChange(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.link}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        data-group-current={groupCurrent ? 'true' : undefined}
        onPointerDown={() => {
          pointerDown.current = true;
        }}
        onFocus={() => {
          // Keyboard focus opens the menu; a mouse press is handled by onClick instead.
          if (!pointerDown.current) onOpenChange(true);
          pointerDown.current = false;
        }}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </button>
      <ul id={menuId} className={styles.menu}>
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className={styles.menuLink}
              aria-current={pathname === item.to ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function Header() {
  const { t } = useTranslation(['common', 'site']);
  const { pathname } = useLocation();
  const { data: site } = useSiteSettings();
  const { data: services } = useServices();
  // Each menu remembers the path it was opened on, so a route change closes it without an effect.
  const [menuAt, setMenuAt] = useState<string | null>(null);
  // Only one submenu is open at a time; it remembers the path it was opened on.
  const [openMenu, setOpenMenu] = useState<{ id: MenuId; at: string } | null>(null);
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
  const isOpen = (id: MenuId) => openMenu?.id === id && openMenu.at === pathname;
  const setMenuOpen = (id: MenuId) => (open: boolean) =>
    setOpenMenu((current) =>
      open ? { id, at: pathname } : current?.id === id ? null : current,
    );
  const servicesItems: MenuItem[] = [
    { to: '/services', label: t('common:nav.services') },
    ...(services ?? []).map((service) => ({
      to: `/services/${service.slug}`,
      label: service.name,
    })),
  ];
  const aboutItems: MenuItem[] = [
    { to: '/about', label: t('common:nav.about') },
    { to: '/team', label: t('site:header.team') },
    { to: '/areas', label: t('site:header.areas') },
    { to: '/careers', label: t('common:nav.careers') },
  ];
  const phone = site.business.phone;
  const tel = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'Escape') return;
    setOpenMenu(null);
    setMenuAt(null);
  }

  return (
    <header ref={headerRef} className={styles.header} onKeyDown={onKeyDown}>
      <div className={cx('container', styles.inner)}>
        <Link to="/" className={styles.brand} aria-current={pathname === '/' ? 'page' : undefined}>
          <Logo name={t('site:brand.name')} subtitle={t('site:brand.subtitle')} />
        </Link>

        <nav
          id="site-nav"
          aria-label={t('site:header.mainNav')}
          className={cx(styles.nav, menuOpen && styles.navOpen)}
          data-open={menuOpen}
        >
          <ul className={styles.list}>
            <li>
              <Link
                to="/"
                className={styles.link}
                aria-current={pathname === '/' ? 'page' : undefined}
              >
                {t('common:nav.home')}
              </Link>
            </li>
            <NavMenu
              id="services"
              label={t('common:nav.services')}
              items={servicesItems}
              pathname={pathname}
              open={isOpen('services')}
              onOpenChange={setMenuOpen('services')}
            />
            <li>
              <Link
                to="/how-it-works"
                className={styles.link}
                aria-current={pathname === '/how-it-works' ? 'page' : undefined}
              >
                {t('common:nav.howItWorks')}
              </Link>
            </li>
            <NavMenu
              id="about"
              label={t('common:nav.about')}
              items={aboutItems}
              pathname={pathname}
              open={isOpen('about')}
              onOpenChange={setMenuOpen('about')}
            />
            <li>
              <Link
                to="/faq"
                className={styles.link}
                aria-current={pathname === '/faq' ? 'page' : undefined}
              >
                {t('site:header.faq')}
              </Link>
            </li>
            <li>
              <Link
                to="/contact"
                className={styles.link}
                aria-current={pathname === '/contact' ? 'page' : undefined}
              >
                {t('common:nav.contact')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className={styles.actions}>
          <ThemeToggle label={t('common:theme.dark')} />
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
