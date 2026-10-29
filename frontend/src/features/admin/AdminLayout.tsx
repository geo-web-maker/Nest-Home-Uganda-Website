import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { useAuth } from './auth/useAuth';
import { AdminIcon } from './icons';
import { ThemeSwitch } from '../../components/ui/ThemeSwitch';
import { ADMIN_NAV, bottomNav, visibleNav, type AdminNavItem } from './nav';
import styles from './AdminLayout.module.css';

const GROUPS = ['website', 'careOperations', 'monitoring', 'safety', 'setup'] as const;

function currentItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV.filter((item) =>
    item.path === '/admin' ? pathname === '/admin' : pathname.startsWith(item.path),
  ).sort((a, b) => b.path.length - a.path.length)[0];
}

/** Shell for every signed-in admin screen: sidebar, phone bottom nav, top bar, content area. */
export function AdminLayout() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  const [moreOpen, setMoreOpen] = useState(false);

  // On a route change: close the More list, go to the top and focus <main> for screen readers.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setMoreOpen(false);
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      moreRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const items = visibleNav(user);
  const { primary, more } = bottomNav(user);
  const title = currentItem(pathname);
  const label = (item: AdminNavItem) => t(`nav.${item.labelKey}`);
  const initial = user?.name.trim().charAt(0).toUpperCase() ?? '';

  const signOut = () => {
    setMoreOpen(false);
    void logout();
  };

  return (
    <div className={styles.shell}>
      <a
        href="#admin-main"
        className={styles.skip}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {tc('a11y.skipToContent')}
      </a>

      <aside className={styles.sidebar}>
        <nav aria-label={t('layout.sidebarLabel')} className={styles.sidebarNav}>
          {GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className={styles.group}>
                <p className={styles.groupLabel}>{t(`groups.${group}`)}</p>
                {groupItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/admin'}
                    className={({ isActive }) => cx(styles.item, isActive && styles.current)}
                  >
                    <AdminIcon name={item.icon} />
                    <span className={styles.itemLabel}>{label(item)}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button type="button" className={cx(styles.item, styles.signOut)} onClick={signOut}>
          <AdminIcon name="signOut" />
          <span className={styles.itemLabel}>{t('layout.signOut')}</span>
        </button>
      </aside>

      <div className={styles.body}>
        <header className={styles.topBar}>
          <p className={styles.title}>{title ? label(title) : ''}</p>
          <ThemeSwitch
            compact
            label={t('layout.themeLabel')}
            lightLabel={t('layout.light')}
            darkLabel={t('layout.dark')}
          />
          <div className={styles.user}>
            <span className={styles.userText}>
              <span className={styles.userName}>{user?.name}</span>
              {user?.is_superadmin && (
                <span className={styles.userNote}>{t('layout.superadmin')}</span>
              )}
            </span>
            <span className={styles.initial} aria-hidden="true">
              {initial}
            </span>
          </div>
        </header>
        <main id="admin-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>

      {moreOpen && (
        <ul id="admin-more" className={styles.moreList}>
          {more.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => cx(styles.moreItem, isActive && styles.moreCurrent)}
              >
                <AdminIcon name={item.icon} />
                {label(item)}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" className={styles.moreItem} onClick={signOut}>
              <AdminIcon name="signOut" />
              {t('layout.signOut')}
            </button>
          </li>
        </ul>
      )}
      <nav aria-label={t('layout.shortcutsLabel')} className={styles.bottomNav}>
        {primary.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/admin'}
            className={({ isActive }) => cx(styles.tab, isActive && styles.tabCurrent)}
          >
            <AdminIcon name={item.icon} />
            <span>{item.path === '/admin' ? t('nav.today') : label(item)}</span>
          </NavLink>
        ))}
        <button
          ref={moreRef}
          type="button"
          className={cx(styles.tab, moreOpen && styles.tabCurrent)}
          aria-expanded={moreOpen}
          aria-controls="admin-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <AdminIcon name="more" />
          <span>{t('layout.more')}</span>
        </button>
      </nav>
    </div>
  );
}
