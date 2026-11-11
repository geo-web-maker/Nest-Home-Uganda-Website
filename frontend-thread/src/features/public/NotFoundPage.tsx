import { useTranslation } from 'react-i18next';
import { Head } from 'vite-react-ssg';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorDoor, ShapeField } from '../../components/thread/ThreadParts';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <section className={styles.page}>
      <Head>
        <title>{`${t('notFound.title')} | Bloomwell Home Care Uganda`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ShapeField variant="error" />
      <div className={`container ${styles.inner}`}>
        <div className={styles.visual}><ErrorDoor code="404" kind="open" /></div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>404 · {t('notFound.title')}</p>
          <h1 className={styles.title}>{t('notFound.title')}</h1>
          <p className={styles.body}>{t('notFound.body')}</p>
          <nav className={styles.shortcuts} aria-label={t('a11y.quickLinks')}>
            <Link to="/services">{t('nav.services')}</Link>
            <Link to="/how-it-works">{t('nav.howItWorks')}</Link>
            <Link to="/about">{t('nav.about')}</Link>
          </nav>
          <div className={styles.actions}>
            <Button href="/">{t('error.home')}</Button>
            <Button href="/contact" variant="outline">{t('notFound.contact')}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
