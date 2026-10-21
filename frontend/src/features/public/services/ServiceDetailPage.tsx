import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { Accordion } from '../../../components/ui/Accordion';
import { Button } from '../../../components/ui/Button';
import { CheckList } from '../../../components/ui/CheckList';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { ServiceCard } from '../../../components/site/ServiceCard';
import { Steps } from '../../../components/site/Steps';
import { Strip } from '../../../components/site/Strip';
import { BookingForm } from '../booking/BookingForm';
import { submitEnquiryViaClient } from '../booking/enquirySubmit';
import { bookingCopyEn } from '../../../locales/en/booking';
import { apiClient } from '../../../lib/api/client';
import { normaliseUgPhone } from '../../../lib/phone';
import { useService, useServices } from '../../../lib/queries/services';
import { useSiteSettings } from '../../../lib/queries/site';
import type { ServicePublicDetail } from '../../../types';
import type { FaqPublic } from '../faq/types';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './ServiceDetailPage.module.css';

export function ServiceDetailPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const detail = useService(slug);
  const services = useServices();
  const { data: site } = useSiteSettings();
  const faqs = useQuery({
    queryKey: ['public', 'faqs', slug],
    queryFn: () =>
      apiClient.get<FaqPublic[]>('/public/faqs', { params: { lang: 'en', service_slug: slug } }),
  });
  const matchingFaqs = useMemo(() => (faqs.data ?? []).slice(0, 6), [faqs.data]);
  const phone = site.business.phone;
  const callHref = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;
  if (detail.isError)
    return (
      <section className={styles.state} role="alert">
        <p>{t('serviceDetail.error')}</p>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          {tc('actions.retry')}
        </Button>
      </section>
    );
  if (!detail.data)
    return (
      <section className={styles.state} aria-busy="true">
        <p>{t('serviceDetail.loading')}</p>
      </section>
    );
  const service: ServicePublicDetail = detail.data;
  const faqItems = matchingFaqs.map((faq) => ({
    id: faq.id,
    summary: faq.question,
    content: faq.answer,
  }));
  return (
    <>
      <Seo
        title={service.seo_title || service.name}
        description={service.seo_description || service.summary}
        path={`/services/${service.slug}`}
      />
      <PageHero
        rule={service.hero_label}
        title={service.hero_headline}
        lead={service.hero_lead}
        breadcrumb={[
          { label: tc('nav.home'), to: '/' },
          { label: tc('nav.services'), to: '/services' },
          { label: service.name },
        ]}
      />
      <Strip items={service.facts} label={t('serviceDetail.factsLabel')} />
      <div className={styles.layout}>
        <div className={styles.content}>
          <Reveal as="section" className={styles.block}>
            <h2>{t('serviceDetail.whoHeading')}</h2>
            <p>{t('serviceDetail.whoLead', { service: service.name })}</p>
            <ul className={styles.whoGrid}>
              {service.who_for.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal as="section" className={styles.block}>
            <h2>{t('serviceDetail.includesHeading')}</h2>
            <CheckList
              label={t('serviceDetail.includesHeading')}
              items={service.includes.map((text, index) => ({ id: `${index}-${text}`, text }))}
            />
          </Reveal>
          <Reveal as="section" className={styles.block}>
            <h2>{t('serviceDetail.howHeading')}</h2>
            <p>{service.how_often}</p>
            <Steps
              label={t('serviceDetail.stepsLabel')}
              items={[0, 1, 2].map((index) => ({
                id: String(index + 1),
                number: `0${index + 1}`,
                title: t(`serviceDetail.steps.${index}.title`),
                text: t(`serviceDetail.steps.${index}.text`),
              }))}
            />
          </Reveal>
          <Reveal as="section" className={styles.block}>
            <h2>{t('serviceDetail.faqHeading')}</h2>
            {faqs.isError ? (
              <p role="alert">{t('serviceDetail.faqError')}</p>
            ) : faqItems.length ? (
              <Accordion items={faqItems} />
            ) : (
              <p>{t('serviceDetail.clientToSupply')}</p>
            )}
            <Link to="/faq">{t('serviceDetail.allFaqs')}</Link>
          </Reveal>
        </div>
        <aside className={styles.booking} aria-label={t('serviceDetail.bookingLabel')}>
          <BookingForm
            copy={{ ...bookingCopyEn, title: t('serviceDetail.bookingTitle') }}
            services={(services.data ?? []).map((item) => ({ id: item.id, name: item.name }))}
            preselectedServiceIds={[service.id]}
            whatsappDigits={site.business.whatsapp}
            callHref={callHref}
            submit={submitEnquiryViaClient}
          />
        </aside>
      </div>
      {service.related.length > 0 && (
        <section className={styles.related}>
          <div className="container">
            <h2>{t('serviceDetail.relatedHeading')}</h2>
            <ul className={styles.relatedGrid}>
              {service.related.map((related, index) => (
                <Reveal as="li" index={index} key={related.id}>
                  <ServiceCard service={related} />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
