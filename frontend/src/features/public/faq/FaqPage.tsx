import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { apiClient } from '../../../lib/api/client';
import type { ArticlePublic, FaqPublic } from './types';
import styles from './FaqPage.module.css';

function accentLastWord(value: string) {
  const split = value.lastIndexOf(' ');
  if (split < 0) return value;
  return <>{value.slice(0, split)} <em className={styles.accent}>{value.slice(split + 1)}</em></>;
}

export function FaqPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const faqs = useQuery({ queryKey: ['public', 'faqs'], queryFn: () => apiClient.get<FaqPublic[]>('/public/faqs', { params: { lang: 'en' } }) });
  const articles = useQuery({ queryKey: ['public', 'articles'], queryFn: () => apiClient.get<ArticlePublic[]>('/public/articles', { params: { lang: 'en' } }) });
  return (
    <div className={styles.page}>
      <Seo title={t('faq.seoTitle')} description={t('faq.seoDescription')} path="/faq" />
      <PageHero rule={t('faq.rule')} title={accentLastWord(t('faq.title'))} lead={t('faq.lead')} breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('faq.rule') }]} />
      <section className={styles.section}><div className="container"><div className={styles.questions}>{faqs.isError ? <p role="alert">{t('faq.error')}</p> : faqs.data?.length ? faqs.data.map((item, index) => <details key={item.id} open={index === 0}><summary>{item.question}</summary><p>{item.answer}</p></details>) : <p aria-busy={!faqs.data}>{faqs.data ? t('faq.clientToSupply') : t('faq.loading')}</p>}</div><aside className={styles.tips}><h2>{t('faq.tipsHeading')}</h2>{articles.isError ? <p role="alert">{t('faq.articlesError')}</p> : articles.data?.length ? <ul>{articles.data.map((article) => <li key={article.id}><Link to={`/faq/${article.slug}`}>{article.title}</Link></li>)}</ul> : <p aria-busy={!articles.data}>{articles.data ? t('faq.articleComingSoon') : t('faq.loading')}</p>}</aside></div></section>
      <CtaBand heading={t('faq.ctaHeading')} bookLabel={tc('actions.book')} whatsappLabel={tc('actions.whatsapp')} />
    </div>
  );
}
