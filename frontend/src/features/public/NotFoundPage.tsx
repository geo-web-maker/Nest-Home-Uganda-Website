import { useTranslation } from 'react-i18next';
import { Head } from 'vite-react-ssg';
import { Button } from '../../components/ui/Button';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <section className={styles.page}>
      <div className="container">
        <Head>
          <title>{`${t('notFound.title')} | Well Nest Home Care Uganda`}</title>
          <meta name="robots" content="noindex" />
        </Head>
        <div className={styles.content}>
          <h1 className={styles.title}>{t('notFound.title')}</h1>
          <Button href="/">{t('nav.home')}</Button>
        </div>
      </div>
    </section>
  );
}
