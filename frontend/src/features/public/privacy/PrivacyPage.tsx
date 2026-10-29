import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { apiClient } from '../../../lib/api/client';
import type { PublicPageContent } from './types';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './PrivacyPage.module.css';

const PLACEHOLDER = 'client to supply';
export function PrivacyPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const page = useQuery({ queryKey: ['public', 'pages', 'privacy'], queryFn: () => apiClient.get<PublicPageContent>('/public/pages/privacy', { params: { lang: 'en' } }) });
  const suppliedBody = page.data?.body?.trim();
  const blocks = suppliedBody && suppliedBody !== PLACEHOLDER
    ? [{ heading: page.data?.title || t('privacy.title'), body: suppliedBody }]
    : [
        { heading: t('privacy.collectHeading'), body: PLACEHOLDER },
        { heading: t('privacy.useHeading'), body: PLACEHOLDER },
        { heading: t('privacy.choicesHeading'), body: PLACEHOLDER },
      ];
  return (
    <div className={styles.page}>
      <Seo title={t('privacy.seoTitle')} description={t('privacy.seoDescription')} path="/privacy" />
      <PageHero rule={t('privacy.rule')} title={t('privacy.title')} lead={t('privacy.lead')} breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('privacy.rule') }]} />
      <section className={styles.section}><div className="container"><div className={styles.body}>{page.isError && <p role="alert">{t('privacy.error')}</p>}{blocks.map((block) => <Reveal as="section" className={styles.block} key={block.heading}><h2>{block.heading}</h2><p>{block.body}</p></Reveal>)}<p className={styles.notice}>{t('privacy.reviewNotice')}</p></div></div></section>
    </div>
  );
}
