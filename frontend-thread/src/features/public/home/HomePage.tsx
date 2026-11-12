import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { Seo } from '../../../components/site/Seo';
import { Button } from '../../../components/ui/Button';
import { Reveal } from '../../../components/ui/Reveal';
import { Arch, FillWords, Hang, HeroWords, Rail, RailCard, ShapeField, Story, Tape } from '../../../components/thread/ThreadParts';
import { apiClient } from '../../../lib/api/client';
import { normaliseUgPhone } from '../../../lib/phone';
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
  const telHref = `tel:${normaliseUgPhone(phone) ?? phone.replace(/\s/g, '')}`;
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
          <HeroWords text={`${t('home.heroBefore')} ${t('home.heroAccent')} ${t('home.heroAfter')}`} />
          <p className={styles.lead}>{t('home.lead')}</p>
          <div className={styles.actions}>
            <Button href="/contact">{t('home.primaryAction')}</Button>
            <Button href="/services" variant="outline">{t('home.secondaryAction')}</Button>
          </div>
        </div>
        <a href="#home-services" className={styles.cue}>{t('thread.scrollCue')}</a>
      </section>
      {services.data?.length ? <Tape items={services.data.map((item) => item.name)} /> : null}
      <section id="home-services" className={styles.railSection}>
        {services.isError ? <div className="container"><p role="alert">{t('services.error')}</p></div> : services.data?.length ? (
          <Rail
            label={t('services.listLabel')}
            previousLabel={t('thread.previousServices')}
            nextLabel={t('thread.nextServices')}
            head={<Reveal className={styles.railIntro}><h2>{t('home.servicesTitleBefore')} {t('home.servicesTitleAccent')} {t('home.servicesTitleAfter')}</h2><p>{t('home.lead')}</p></Reveal>}
          >
            {services.data.map((service, index) => <RailCard key={service.id} number={service.number} title={service.name} summary={service.summary} href={`/services/${service.slug}`} photo={servicePhotoUrl(service)} readLabel={t('thread.readAboutCare')} tone={(['f', 's', 'l', 'w'] as const)[index % 4]} />)}
          </Rail>
        ) : <div className="container"><p aria-busy="true">{t('services.loading')}</p></div>}
      </section>
      <section className={styles.hangSection}>
        <div className={`container ${styles.whoGrid}`}>
          <Reveal className={styles.whoHead}>
            <h2>{t('thread.hangHeading')}</h2>
            <p className={styles.whoLead}>{t('thread.hangRule')}.</p>
            <Button href="/services" variant="outline">{t('home.allServices')}</Button>
          </Reveal>
          <Hang items={hangItems} label={t('thread.hangLabel')} />
        </div>
      </section>
      <Story
        steps={steps}
        phone={phone}
        telHref={telHref}
        planItems={[t('thread.planWho'), t('thread.planWhat'), t('thread.planWhen')]}
        photo="/images/services/service-0-elderly.jpg"
        photoAlt=""
        heading={t('thread.storyHeading')}
        callLabel={t('thread.firstCall')}
        callSay={t('thread.callOrWhatsapp')}
        callSame={t('thread.sameNumber')}
        stepLink={t('thread.tapToCall', { phone })}
        caption={steps[2]?.text ?? ''}
      />
      <section className={styles.promiseSection}>
        <div className="container">
          <Reveal as="h2">{t('home.promiseTitleBefore')} {t('home.promiseTitleAccent')}</Reveal>
          <FillWords items={promise} />
        </div>
      </section>
      {settings.data?.home?.show_team !== false && team.data?.length ? (
        <section className={styles.teamSection}>
          <div className="container">
                        <div className={styles.sectionHeading}><h2>{t('home.teamTitleBefore')} {t('home.teamTitleAccent')}</h2><Button href="/team" variant="outline">{t('home.meetTeam')}</Button></div>
            <div className={styles.teamGrid}>{team.data.slice(0, 4).map((member, index) => <Reveal key={member.id} index={index}><div className={styles.teamDoor}><Arch placeholder ratio="3/4" /><h3>{member.name}</h3><p>{[member.role, member.qualification].filter(Boolean).join(' · ')}</p></div></Reveal>)}</div>
          </div>
        </section>
      ) : null}
      {settings.data?.home?.show_testimonials === true && testimonials.data?.length ? (
        <section className={styles.testimonials}>
          <div className="container"><h2>{t('home.testimonialsTitle')}</h2>
            <div className={styles.quoteGrid}>{testimonials.data.slice(0, 3).map((item) => <blockquote key={item.id}><span aria-hidden="true">“</span><p>{item.quote}</p><footer>{item.first_name}, {item.area}</footer></blockquote>)}</div>
          </div>
        </section>
      ) : null}
      <CtaBand heading={t('home.ctaHeading')} bookLabel={t('home.ctaBook')} whatsappLabel={tc('actions.whatsapp')} />
    </>
  );
}
