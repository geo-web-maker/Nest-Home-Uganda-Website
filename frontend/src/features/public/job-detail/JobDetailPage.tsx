import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { CheckList } from '../../../components/ui/CheckList';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { JobPublic } from '../careers/types';
import { ApplicationForm } from '../careers/ApplicationForm';
import type { JobPublicDetail } from './types';
import styles from './JobDetailPage.module.css';

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const generalJobs = useQuery({
    queryKey: ['public', 'jobs'],
    enabled: id === 'general',
    queryFn: () => apiClient.get<JobPublic[]>('/public/jobs', { params: { lang: 'en' } }),
  });
  const job = useQuery({
    queryKey: ['public', 'job', id],
    enabled: Boolean(id) && id !== 'general',
    queryFn: () =>
      apiClient.get<JobPublicDetail>(`/public/jobs/${encodeURIComponent(id)}`, {
        params: { lang: 'en' },
      }),
  });

  if (id === 'general')
    return (
      <>
        <Seo
          title={t('careers.seoTitle')}
          description={t('careers.seoDescription')}
          path="/careers/general"
        />
        <PageHero
          rule={t('careers.rule')}
          title={t('careers.generalTitle')}
          lead={t('careers.generalLead')}
          breadcrumb={[
            { label: tc('nav.home'), to: '/' },
            { label: t('careers.rule'), to: '/careers' },
            { label: t('careers.generalTitle') },
          ]}
        />
        <section className={styles.content}>
          <div className="container">
            <div id="application" className={styles.application}>
              <h2>{t('careers.applicationHeading')}</h2>
              <p>{t('careers.applicationNote')}</p>
              {generalJobs.isError ? (
                <p role="alert">{t('careers.error')}</p>
              ) : (
                <ApplicationForm jobs={generalJobs.data ?? []} />
              )}
            </div>
          </div>
        </section>
      </>
    );
  if (job.isError)
    return (
      <section className={styles.state} role="alert">
        <p>{t('careers.detailError')}</p>
        <Button variant="outline" onClick={() => void job.refetch()}>
          {tc('actions.retry')}
        </Button>
      </section>
    );
  if (!job.data)
    return (
      <section className={styles.state} aria-busy="true">
        <p>{t('careers.loading')}</p>
      </section>
    );
  return (
    <>
      <Seo
        title={`${job.data.title} | ${t('careers.seoTitle')}`}
        description={t('careers.seoDescription')}
        path={`/careers/${job.data.id}`}
      />
      <PageHero
        rule={t('careers.rule')}
        title={job.data.title}
        lead={`${job.data.location} · ${t(`careers.types.${job.data.type}`)}`}
        breadcrumb={[
          { label: tc('nav.home'), to: '/' },
          { label: t('careers.rule'), to: '/careers' },
          { label: job.data.title },
        ]}
      />
      <section className={styles.content}>
        <div className="container">
          <h2>{t('careers.descriptionHeading')}</h2>
          <p>{job.data.description}</p>
          <h2>{t('careers.requirementsHeading')}</h2>
          <CheckList
            label={t('careers.requirementsHeading')}
            items={job.data.requirements
              .split('\n')
              .filter(Boolean)
              .map((text, index) => ({ id: String(index), text }))}
          />
          <div id="application" className={styles.application}>
            <h2>{t('careers.applicationHeading')}</h2>
            <p>{t('careers.applicationNote')}</p>
            <ApplicationForm jobs={[job.data]} selectedJobId={job.data.id} />
          </div>
        </div>
      </section>
    </>
  );
}
