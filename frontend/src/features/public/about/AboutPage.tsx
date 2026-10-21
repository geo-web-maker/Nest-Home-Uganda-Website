import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { MapPlaceholder } from '../../../components/site/MapPlaceholder';
import { PageHero } from '../../../components/site/PageHero';
import { Rings } from '../../../components/site/Rings';
import { Seo } from '../../../components/site/Seo';
import { CheckList } from '../../../components/ui/CheckList';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { PublicPageContent } from './types';
import styles from './AboutPage.module.css';

export function AboutPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const story = useQuery({
    queryKey: ['public-page', 'about_story'],
    queryFn: () =>
      apiClient.get<PublicPageContent>('/public/pages/about_story', { params: { lang: 'en' } }),
  });
  const credentials = useQuery({
    queryKey: ['public-page', 'about_credentials'],
    queryFn: () =>
      apiClient.get<PublicPageContent>('/public/pages/about_credentials', {
        params: { lang: 'en' },
      }),
  });
  const rings = [
    { id: 'trusted', title: t('about.promise.trustedTitle'), text: t('about.promise.trustedText') },
    {
      id: 'reliable',
      title: t('about.promise.reliableTitle'),
      text: t('about.promise.reliableText'),
    },
    {
      id: 'compassionate',
      title: t('about.promise.compassionateTitle'),
      text: t('about.promise.compassionateText'),
    },
  ];
  return (
    <>
      <Seo title={t('about.seoTitle')} description={t('about.seoDescription')} path="/about" />
      <PageHero
        rule={t('about.rule')}
        title={t('about.title')}
        lead={t('about.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('about.rule') }]}
      />
      <section className={styles.story}>
        <div className={`container ${styles.storyGrid}`}>
          <div>
            <h2>{t('about.storyHeading')}</h2>
            {story.isError ? (
              <div role="alert">
                <p>{t('about.error')}</p>
                <Button variant="outline" onClick={() => void story.refetch()}>
                  {tc('actions.retry')}
                </Button>
              </div>
            ) : (
              <p>{story.data?.body || t('about.clientToSupply')}</p>
            )}
          </div>
          <MapPlaceholder label={t('about.teamPhotoPlaceholder')} />
        </div>
      </section>
      <section className={styles.promise}>
        <div className="container">
          <h2>{t('about.promiseHeading')}</h2>
          <Rings items={rings} label={t('about.promiseHeading')} />
        </div>
      </section>
      <section className={styles.credentials}>
        <div className="container">
          <h2>{t('about.credentialsHeading')}</h2>
          {credentials.isError ? (
            <div role="alert">
              <p>{t('about.error')}</p>
              <Button variant="outline" onClick={() => void credentials.refetch()}>
                {tc('actions.retry')}
              </Button>
            </div>
          ) : (
            <p>{credentials.data?.body || t('about.clientToSupply')}</p>
          )}
          <CheckList
            label={t('about.credentialsHeading')}
            items={[
              { id: 'registration', text: t('about.credentialBusiness') },
              { id: 'council', text: t('about.credentialCouncil') },
              { id: 'insurance', text: t('about.credentialInsurance') },
              { id: 'training', text: t('about.credentialTraining') },
            ]}
          />
        </div>
      </section>
      <CtaBand
        heading={t('about.ctaHeading')}
        bookLabel={t('about.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
