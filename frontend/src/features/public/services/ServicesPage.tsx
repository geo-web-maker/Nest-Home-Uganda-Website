import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { useServices } from '../../../lib/queries/services';
import { ServiceCard } from '../../../components/site/ServiceCard';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './ServicesPage.module.css';
import { servicePhotoUrl } from './servicePhotos';

const SKELETON_COUNT = 8;

/**
 * Services overview (spec 5.2). Pre-render ships the hero, the loading skeleton and the CTA band;
 * the cards load after hydration (decision recorded in docs/STATE.md, S3.10).
 */
export function ServicesPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const services = useServices();

  return (
    <>
      <Seo
        title={t('services.seoTitle')}
        description={t('services.seoDescription')}
        path="/services"
      />
      <PageHero
        rule={t('services.rule')}
        title={t('services.title')}
        lead={t('services.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: tc('nav.services') }]}
      />
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.srOnly}>{t('services.listLabel')}</h2>
          {services.isError ? (
            <div className={styles.error} role="alert">
              <p>{t('services.error')}</p>
              <Button type="button" variant="outline" onClick={() => void services.refetch()}>
                {t('services.retry')}
              </Button>
            </div>
          ) : services.data ? (
            services.data.length > 0 && (
              <ul className={styles.grid}>
                {services.data.map((service, index) => (
                  <Reveal as="li" index={index % 4} key={service.id}>
                    <ServiceCard service={service} photoUrl={servicePhotoUrl(service)} />
                  </Reveal>
                ))}
              </ul>
            )
          ) : (
            <ul className={styles.grid} aria-busy="true" aria-label={t('services.loading')}>
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <li key={index} className={styles.skeleton} aria-hidden="true" />
              ))}
            </ul>
          )}
        </div>
      </section>
      <CtaBand
        heading={t('services.ctaHeading')}
        bookLabel={t('services.ctaBook')}
        whatsappLabel={t('services.ctaWhatsapp')}
      />
    </>
  );
}
