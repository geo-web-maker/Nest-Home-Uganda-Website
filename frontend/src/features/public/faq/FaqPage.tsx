import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Accordion } from '../../../components/ui/Accordion';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { apiClient } from '../../../lib/api/client';
import type { ArticlePublic, FaqPublic } from './types';
import styles from './FaqPage.module.css';

export function FaqPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const faqs = useQuery({
    queryKey: ['public', 'faqs'],
    queryFn: () => apiClient.get<FaqPublic[]>('/public/faqs', { params: { lang: 'en' } }),
  });
  const articles = useQuery({
    queryKey: ['public', 'articles'],
    queryFn: () => apiClient.get<ArticlePublic[]>('/public/articles', { params: { lang: 'en' } }),
  });
  return (
    <>
      <Seo title={t('faq.seoTitle')} description={t('faq.seoDescription')} path="/faq" />
      <PageHero
        rule={t('faq.rule')}
        title={t('faq.title')}
        lead={t('faq.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('faq.rule') }]}
      />
      <section className={styles.section}>
        <div className={`container ${styles.columns}`}>
          <div>
            <h2>{t('faq.questionsHeading')}</h2>
            {faqs.isError ? (
              <p role="alert">{t('faq.error')}</p>
            ) : faqs.data?.length ? (
              <Accordion
                items={faqs.data.map((item) => ({
                  id: item.id,
                  summary: item.question,
                  content: item.answer,
                }))}
              />
            ) : (
              <p aria-busy={!faqs.data}>{faqs.data ? t('faq.clientToSupply') : t('faq.loading')}</p>
            )}
          </div>
          <aside>
            <h2>{t('faq.tipsHeading')}</h2>
            {articles.isError ? (
              <p role="alert">{t('faq.articlesError')}</p>
            ) : articles.data?.length ? (
              <ul className={styles.articles}>
                {articles.data.map((article) => (
                  <li key={article.id}>
                    <Link to={`/faq/${article.slug}`}>{article.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p aria-busy={!articles.data}>
                {articles.data ? t('faq.articleComingSoon') : t('faq.loading')}
              </p>
            )}
          </aside>
        </div>
      </section>
      <CtaBand
        heading={t('faq.ctaHeading')}
        bookLabel={t('faq.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
