import { useTranslation } from 'react-i18next';
import { Head } from 'vite-react-ssg';
import { Button } from '../../components/ui/Button';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <div className="container">
      <Head>
        <title>{`${t('notFound.title')} | Nest Home Care Uganda`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <h1>{t('notFound.title')}</h1>
      <Button href="/">{t('nav.home')}</Button>
    </div>
  );
}
