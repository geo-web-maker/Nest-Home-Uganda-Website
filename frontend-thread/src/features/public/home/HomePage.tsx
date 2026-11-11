import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { Reveal } from '../../../components/ui/Reveal';
import { Arch, FillWords, Hang, Rail, RailCard, ShapeField, Story, Tape } from '../../../components/thread/ThreadParts';
import { apiClient } from '../../../lib/api/client';
import { useServices } from '../../../lib/queries/services';
import { useSiteSettings } from '../../../lib/queries/site';
import { servicePhotoUrl } from '../services/servicePhotos';
import type { TeamMemberPublic } from '../team/types';
import type { HomeSettings, TestimonialPublic } from './types';
import styles from './HomePage.module.css';

export function HomePage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const services = useServices();
  const site = useSiteSettings();
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
    queryFn: () => apiClient.get<TestimonialPublic[]>('/public/testimonials', { params: { lang: 'en' } }),
  });
  const phone = site.data.business.phone;
  const steps = [0, 1, 2].map((index) => ({ title: t(`home.steps.${index}.title`), text: t(`home.steps.${index}.text`) }));
  const promise = [0, 1, 2].map((index) => ({ word: t(`home.promise.${index}.title`), text: t(`home.promise.${index}.text`) }));
  const hangItems = [
    { title: t('home.eggs.0.title'), caption: t('home.eggs.0.caption'), href: '/services', photo: '/images/services/service-0-elderly.jpg' },
    { title: t('home.eggs.1.title'), caption: t('home.eggs.1.caption'), href: '/services', photo: '/images/services/service-1-postnatal.jpg' },
    { title: t('home.eggs.2.title'), caption: t('home.eggs.2.caption'), href: '/services', photo: '/images/services/service-2-wound-care.jpg' },
  ];
  return (
    <>
      <Seo title={t('home.seoTitle')} description={t('home.seoDescription')} path="/" />
      <section className={`${styles.hero} on-hero`}>
        <ShapeField variant="hero" />
        <div className={`container ${styles.heroInner}`}>
          <p className={styles.rule}>{t('home.rule')}</p>
          <h1 aria-label={`${t('home.heroBefore')} ${t('home.heroAccent')} ${t('home.heroAfter')}`}>
            <span aria-hidden="true">{t('home.heroBefore')}</span>{' '}
            <span className={styles.heroAccent} aria-hidden="true">{t('home.heroAccent')}</span>{' '}
            <span aria-hidden="true">{t('home.heroAfter')}</span>
          </h1>
          <p className={styles.lead}>{t('home.lead')}</p>
          <div className={styles.actions}>
            <Button href="/contact">{t('home.primaryAction')}</Button>
            <Button href="/services" variant="outline">{t('home.secondaryAction')}</Button>
          </div>
          <a href="#home-services" className={styles.scrollCue}><span aria-hidden="true">↓</span> {t('thread.scrollToExplore')}</a>
        </div>
      </section>
      {services.data?.length ? <Tape items={services.data.map((item) => item.name)} /> : null}
      <section id="home-services" className={styles.railSection}>
        <div className="container">
          <div className={styles.sectionIntro}>
            <p className={styles.rule}>{t('home.servicesRule')}</p>
            <h2>{t('home.servicesTitleBefore')} <em>{t('home.servicesTitleAccent')}</em> {t('home.servicesTitleAfter')}</h2>
            <p>{t('home.lead')}</p>
          </div>
          {services.isError ? <p role="alert">{t('services.error')}</p> : services.data?.length ? (
            <Rail label={t('services.listLabel')} previousLabel={t('thread.previousServices')} nextLabel={t('thread.nextServices')}>
              {services.data.map((service, index) => <RailCard key={service.id} number={service.number} title={service.name} summary={service.summary} href={`/services/${service.slug}`} photo={servicePhotoUrl(service)} readLabel={t('thread.readAboutCare')} tone={(['f', 's', 'l', 'w'] as const)[index % 4]} />)}
            </Rail>
          ) : <p aria-busy="true">{t('services.loading')}</p>}
          <div className={styles.center}><Button href="/services" variant="outline">{t('home.allServices')}</Button></div>
        </div>
      </section>
      <section className={styles.hangSection}>
        <div className="container">
          <div className={styles.sectionIntro}>
            <p className={styles.rule}>{t('thread.hangRule')}</p>
            <h2>{t('thread.hangHeading')}</h2>
          </div>
          <Hang items={hangItems} label={t('thread.hangLabel')} />
        </div>
      </section>
      <Story steps={steps} phone={phone} planItems={[t('home.steps.0.title'), t('home.steps.1.title'), t('home.steps.2.title')]} photo="/images/services/service-0-elderly.jpg" eyebrow={t('thread.storyEyebrow')} heading={t('thread.storyHeading')} firstCall={t('thread.firstCall')} talkToTeam={t('thread.talkToTeam')} carePlan={t('thread.carePlan')} homeVisit={t('thread.homeVisit')} />
      <section className={styles.promiseSection}>
        <div className="container">
          <p className={styles.rule}>{t('home.promiseRule')}</p>
          <h2>{t('home.promiseTitleBefore')} <em>{t('home.promiseTitleAccent')}</em></h2>
          <Reveal><FillWords items={promise} /></Reveal>
        </div>
      </section>
      {settings.data?.home?.show_team !== false && team.data?.length ? (
        <section className={styles.teamSection}>
          <div className="container">
            <p className={styles.rule}>{t('home.teamRule')}</p>
            <div className={styles.sectionHeading}><h2>{t('home.teamTitleBefore')} <em>{t('home.teamTitleAccent')}</em></h2><Button href="/team" variant="outline">{t('home.meetTeam')}</Button></div>
            <div className={styles.teamGrid}>{team.data.slice(0, 4).map((member, index) => <Reveal key={member.id} index={index}><div className={styles.teamDoor}><Arch placeholder ratio="3/4" /><h3>{member.name}</h3><p>{[member.role, member.qualification].filter(Boolean).join(' · ')}</p></div></Reveal>)}</div>
          </div>
        </section>
      ) : null}
      {settings.data?.home?.show_testimonials === true && testimonials.data?.length ? (
        <section className={styles.testimonials}>
          <div className="container"><p className={styles.rule}>{t('home.testimonialsRule')}</p><h2>{t('home.testimonialsTitle')}</h2>
            <div className={styles.quoteGrid}>{testimonials.data.slice(0, 3).map((item) => <blockquote key={item.id}><span aria-hidden="true">“</span><p>{item.quote}</p><footer>{item.first_name}, {item.area}</footer></blockquote>)}</div>
          </div>
        </section>
      ) : null}
      <CtaBand heading={t('home.ctaHeading')} bookLabel={t('home.ctaBook')} whatsappLabel={tc('actions.whatsapp')} />
    </>
  );
}
