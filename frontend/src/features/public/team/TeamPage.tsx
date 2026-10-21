import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CtaBand } from '../../../components/site/CtaBand';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { TeamCard } from '../../../components/site/TeamCard';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { TeamMemberPublic } from './types';
import { Reveal } from '../../../components/ui/Reveal';
import styles from './TeamPage.module.css';

export function TeamPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const team = useQuery({
    queryKey: ['public', 'team'],
    queryFn: () => apiClient.get<TeamMemberPublic[]>('/public/team', { params: { lang: 'en' } }),
  });
  return (
    <>
      <Seo title={t('team.seoTitle')} description={t('team.seoDescription')} path="/team" />
      <PageHero
        rule={t('team.rule')}
        title={t('team.title')}
        lead={t('team.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('team.rule') }]}
      />
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.srOnly}>{t('team.listLabel')}</h2>
          {team.isError ? (
            <div className={styles.state} role="alert">
              <p>{t('team.error')}</p>
              <Button variant="outline" onClick={() => void team.refetch()}>
                {tc('actions.retry')}
              </Button>
            </div>
          ) : team.data ? (
            team.data.length ? (
              <ul className={styles.grid}>
                {team.data.map((member, index) => (
                  <Reveal as="li" index={index % 4} key={member.id}>
                    <TeamCard
                      name={member.name}
                      role={[member.role, member.qualification].filter(Boolean).join(' · ')}
                      placeholderLabel={t('team.photoPlaceholder')}
                    />
                  </Reveal>
                ))}
              </ul>
            ) : (
              <p>{t('team.clientToSupply')}</p>
            )
          ) : (
            <p aria-busy="true">{t('team.loading')}</p>
          )}
        </div>
      </section>
      <CtaBand
        heading={t('team.ctaHeading')}
        bookLabel={t('team.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
