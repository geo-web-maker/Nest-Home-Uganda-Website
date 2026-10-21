import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AccentText } from '../../../components/ui/AccentText';
import { Button } from '../../../components/ui/Button';
import { CtaBand } from '../../../components/site/CtaBand';
import { Rings } from '../../../components/site/Rings';
import { ServiceCard } from '../../../components/site/ServiceCard';
import { Steps } from '../../../components/site/Steps';
import { Strip } from '../../../components/site/Strip';
import { TeamCard } from '../../../components/site/TeamCard';
import { Seo } from '../../../components/site/Seo';
import { apiClient } from '../../../lib/api/client';
import { useServices } from '../../../lib/queries/services';
import type { TeamMemberPublic } from '../team/types';
import type { HomeSettings, TestimonialPublic } from './types';
import styles from './HomePage.module.css';

export function HomePage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const services = useServices();
  const team = useQuery({
    queryKey: ['public', 'team'],
    queryFn: () => apiClient.get<TeamMemberPublic[]>('/public/team', { params: { lang: 'en' } }),
  });
  const settings = useQuery({
    queryKey: ['public', 'site-settings'],
    queryFn: () => apiClient.get<HomeSettings>('/public/site'),
  });
  const testimonials = useQuery({
    queryKey: ['public', 'testimonials'],
    enabled: settings.data?.home?.show_testimonials === true,
    queryFn: () =>
      apiClient.get<TestimonialPublic[]>('/public/testimonials', { params: { lang: 'en' } }),
  });
  const promise = [0, 1, 2].map((index) => ({
    id: String(index),
    title: t(`home.promise.${index}.title`),
    text: t(`home.promise.${index}.text`),
  }));
  const steps = [0, 1, 2].map((index) => ({
    id: String(index),
    number: `0${index + 1}`,
    title: t(`home.steps.${index}.title`),
    text: t(`home.steps.${index}.text`),
  }));
  const eggs = [0, 1, 2].map((index) => ({
    title: t(`home.eggs.${index}.title`),
    caption: t(`home.eggs.${index}.caption`),
  }));
  return (
    <>
      <Seo title={t('home.seoTitle')} description={t('home.seoDescription')} path="/" />
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.rule}>{t('home.rule')}</p>
            <h1>
              {t('home.heroBefore')} <AccentText>{t('home.heroAccent')}</AccentText>{' '}
              {t('home.heroAfter')}
            </h1>
            <p className={styles.lead}>{t('home.lead')}</p>
            <div className={styles.actions}>
              <Button href="/contact">{t('home.primaryAction')}</Button>
              <Button href="/services" variant="outline">
                {t('home.secondaryAction')}
              </Button>
            </div>
          </div>
          <div className={styles.eggs} aria-label={t('home.eggsLabel')}>
            {eggs.map((egg, index) => (
              <div key={egg.title} className={`${styles.egg} ${styles[`egg${index + 1}`]}`}>
                <span>{egg.title}</span>
                <small>{egg.caption}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Strip
        text={settings.data?.home?.location_strip ?? t('home.strip')}
        label={t('home.stripLabel')}
      />
      <section className={styles.services}>
        <div className="container">
          <p className={styles.rule}>{t('home.servicesRule')}</p>
          <h2>
            {t('home.servicesTitleBefore')} <AccentText>{t('home.servicesTitleAccent')}</AccentText>{' '}
            {t('home.servicesTitleAfter')}
          </h2>
          {services.isError ? (
            <p role="alert">{t('services.error')}</p>
          ) : services.data?.length ? (
            <ul className={styles.serviceGrid}>
              {services.data.map((service) => (
                <li key={service.id}>
                  <ServiceCard service={service} />
                </li>
              ))}
            </ul>
          ) : (
            <p aria-busy="true">{t('services.loading')}</p>
          )}
          <div className={styles.center}>
            <Button href="/services" variant="outline">
              {t('home.allServices')}
            </Button>
          </div>
        </div>
      </section>
      <section className={styles.promise}>
        <div className="container">
          <p className={styles.rule}>{t('home.promiseRule')}</p>
          <h2>
            {t('home.promiseTitleBefore')} <AccentText>{t('home.promiseTitleAccent')}</AccentText>
          </h2>
          <Rings items={promise} label={t('home.promiseRule')} />
        </div>
      </section>
      <section className={styles.how}>
        <div className="container">
          <p className={styles.rule}>{t('home.stepsRule')}</p>
          <h2>
            {t('home.stepsTitleBefore')} <AccentText>{t('home.stepsTitleAccent')}</AccentText>
          </h2>
          <Steps items={steps} label={t('home.stepsRule')} />
        </div>
      </section>
      {settings.data?.home?.show_testimonials === true && testimonials.data?.length ? (
        <section className={styles.testimonials}>
          <div className="container">
            <p className={styles.rule}>{t('home.testimonialsRule')}</p>
            <h2>{t('home.testimonialsTitle')}</h2>
            <ul className={styles.testimonialGrid}>
              {testimonials.data.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <blockquote>{item.quote}</blockquote>
                  <p>
                    {item.first_name}, {item.area}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {settings.data?.home?.show_team !== false && team.data?.length ? (
        <section className={styles.team}>
          <div className="container">
            <p className={styles.rule}>{t('home.teamRule')}</p>
            <h2>
              {t('home.teamTitleBefore')} <AccentText>{t('home.teamTitleAccent')}</AccentText>
            </h2>
            <ul className={styles.teamGrid}>
              {team.data.slice(0, 4).map((member) => (
                <li key={member.id}>
                  <TeamCard
                    name={member.name}
                    role={[member.role, member.qualification].filter(Boolean).join(' · ')}
                    placeholderLabel={t('team.photoPlaceholder')}
                  />
                </li>
              ))}
            </ul>
            <div className={styles.center}>
              <Button href="/team" variant="outline">
                {t('home.meetTeam')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      <CtaBand
        heading={t('home.ctaHeading')}
        bookLabel={t('home.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
