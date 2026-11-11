import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { ArticlePublic } from './types';
import styles from './ArticlePage.module.css';

export function ArticlePage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const article = useQuery({
    queryKey: ['public', 'article', slug],
    enabled: Boolean(slug),
    queryFn: () =>
      apiClient.get<ArticlePublic>(`/public/articles/${encodeURIComponent(slug)}`, {
        params: { lang: 'en' },
      }),
  });
  if (article.isError) {
    return (
      <section className={styles.state} role="alert">
        <p>{t('faq.articleError')}</p>
        <Button variant="outline" onClick={() => void article.refetch()}>
          {tc('actions.retry')}
        </Button>
      </section>
    );
  }
  if (!article.data)
    return (
      <section className={styles.state} aria-busy="true">
        <p>{t('faq.loading')}</p>
      </section>
    );
  return (
    <>
      <Seo
        title={article.data.title}
        description={t('faq.seoDescription')}
        path={`/faq/${article.data.slug}`}
      />
      <PageHero
        rule={t('faq.rule')}
        title={article.data.title}
        breadcrumb={[
          { label: tc('nav.home'), to: '/' },
          { label: t('faq.rule'), to: '/faq' },
          { label: article.data.title },
        ]}
      />
      <article className={styles.article}>
        <div className="container">
          <div className={styles.body}>
            {article.data.body
              .split('\n')
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
              ))}
          </div>
        </div>
      </article>
      <CtaBand
        heading={t('faq.ctaHeading')}
        bookLabel={t('faq.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
