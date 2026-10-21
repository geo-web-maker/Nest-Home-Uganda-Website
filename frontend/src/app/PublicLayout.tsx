import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from '../components/site/Footer';
import { Header } from '../components/site/Header';
import { StickyBar } from '../components/site/StickyBar';
import styles from './PublicLayout.module.css';

export function PublicLayout() {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  // On a route change (not the first render): back to the top and focus <main> for screen readers.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <a
        href="#main"
        className={styles.skip}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {t('a11y.skipToContent')}
      </a>
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      <StickyBar />
    </div>
  );
}
