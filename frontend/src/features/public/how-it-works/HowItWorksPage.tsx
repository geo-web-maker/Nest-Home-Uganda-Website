import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { PriceCard } from '../../../components/site/PriceCard';
import { Seo } from '../../../components/site/Seo';
import { Steps } from '../../../components/site/Steps';
import { apiClient } from '../../../lib/api/client';
import type { PricingBlockPublic } from './types';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './HowItWorksPage.module.css';

function accentLastWord(value: string) {
  const split = value.lastIndexOf(' ');
  if (split < 0) return value;
  return <>{value.slice(0, split)} <em className={styles.accent}>{value.slice(split + 1)}</em></>;
}

export function HowItWorksPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const pricing = useQuery({
    queryKey: ['public', 'pricing'],
    queryFn: () =>
      apiClient.get<PricingBlockPublic[]>('/public/pricing', { params: { lang: 'en' } }),
  });
  const steps = [
    {
      id: 'one',
      number: '1',
      title: t('howItWorks.steps.callTitle'),
      text: t('howItWorks.steps.callText'),
    },
    {
      id: 'two',
      number: '2',
      title: t('howItWorks.steps.planTitle'),
      text: t('howItWorks.steps.planText'),
    },
    {
      id: 'three',
      number: '3',
      title: t('howItWorks.steps.homeTitle'),
      text: t('howItWorks.steps.homeText'),
    },
  ];
  return (
    <div className={styles.page}>
      <Seo
        title={t('howItWorks.seoTitle')}
        description={t('howItWorks.seoDescription')}
        path="/how-it-works"
      />
      <PageHero
        rule={t('howItWorks.rule')}
        title={accentLastWord(t('howItWorks.title'))}
        lead={t('howItWorks.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('howItWorks.rule') }]}
      />
      <section className={styles.steps}>
        <div className="container">
          <h2 className={styles.srOnly}>{t('howItWorks.stepsLabel')}</h2>
          <Reveal>
            <Steps items={steps} label={t('howItWorks.stepsLabel')} />
          </Reveal>
        </div>
      </section>
      <section className={styles.pricing}>
        <div className="container">
          <p className={styles.rule}>{t('howItWorks.pricingRule')}</p>
          <h2>{t('howItWorks.pricingHeading')}</h2>
          {pricing.isError ? (
            <div role="alert">
              <p>{t('howItWorks.error')}</p>
              <button type="button" className={styles.retry} onClick={() => void pricing.refetch()}>
                {tc('actions.retry')}
              </button>
            </div>
          ) : pricing.data ? (
            <Reveal className={styles.cards}>
              {pricing.data.map((block) => (
                <PriceCard
                  key={block.id}
                  tag={block.tag}
                  title={block.title}
                  text={block.text}
                  featured={block.key === 'assessment'}
                />
              ))}
            </Reveal>
          ) : (
            <p aria-busy="true">{t('howItWorks.loading')}</p>
          )}
          <p className={styles.payment}>{t('howItWorks.paymentMethods')}</p>
        </div>
      </section>
      <CtaBand
        heading={t('howItWorks.ctaHeading')}
        bookLabel={t('howItWorks.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </div>
  );
}
