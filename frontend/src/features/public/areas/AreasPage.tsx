import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { MapPlaceholder } from '../../../components/site/MapPlaceholder';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { AreaPublic } from './types';
import styles from './AreasPage.module.css';

export function AreasPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const areas = useQuery({
    queryKey: ['public', 'areas'],
    queryFn: () => apiClient.get<AreaPublic[]>('/public/areas', { params: { lang: 'en' } }),
  });
  return (
    <>
      <Seo title={t('areas.seoTitle')} description={t('areas.seoDescription')} path="/areas" />
      <PageHero
        rule={t('areas.rule')}
        title={t('areas.title')}
        lead={t('areas.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('areas.rule') }]}
      />
      <section className={styles.section}>
        <div className="container">
          <h2>{t('areas.neighbourhoodsHeading')}</h2>
          {areas.isError ? (
            <div role="alert">
              <p>{t('areas.error')}</p>
              <Button variant="outline" onClick={() => void areas.refetch()}>
                {tc('actions.retry')}
              </Button>
            </div>
          ) : areas.data ? (
            areas.data.length ? (
              <ul className={styles.chips}>
                {areas.data.map((area) => (
                  <li key={area.id} className={styles.chip}>
                    {area.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('areas.clientToSupply')}</p>
            )
          ) : (
            <p aria-busy="true">{t('areas.loading')}</p>
          )}
          <MapPlaceholder label={t('areas.mapLabel')} description={t('areas.mapDescription')} />
          <p className={styles.note}>{t('areas.notListed')}</p>
        </div>
      </section>
      <CtaBand
        heading={t('areas.ctaHeading')}
        bookLabel={t('areas.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
