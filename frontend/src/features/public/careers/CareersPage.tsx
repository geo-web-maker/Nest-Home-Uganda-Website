import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CtaBand } from '../../../components/site/CtaBand';
import { JobCard } from '../../../components/site/JobCard';
import { ApplicationForm } from './ApplicationForm';
import { PageHero } from '../../../components/site/PageHero';
import { Seo } from '../../../components/site/Seo';
import { CheckList } from '../../../components/ui/CheckList';
import { apiClient } from '../../../lib/api/client';
import type { JobPublic } from './types';
import styles from './CareersPage.module.css';

export function CareersPage() {
  const { t } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const jobs = useQuery({
    queryKey: ['public', 'jobs'],
    queryFn: () => apiClient.get<JobPublic[]>('/public/jobs', { params: { lang: 'en' } }),
  });
  return (
    <>
      <Seo
        title={t('careers.seoTitle')}
        description={t('careers.seoDescription')}
        path="/careers"
      />
      <PageHero
        rule={t('careers.rule')}
        title={t('careers.title')}
        lead={t('careers.lead')}
        breadcrumb={[{ label: tc('nav.home'), to: '/' }, { label: t('careers.rule') }]}
      />
      <section className={styles.section}>
        <div className={`container ${styles.columns}`}>
          <div>
            <h2>{t('careers.openRoles')}</h2>
            {jobs.isError ? (
              <p role="alert">{t('careers.error')}</p>
            ) : jobs.data ? (
              jobs.data.length ? (
                <ul className={styles.jobs}>
                  {jobs.data.map((job) => (
                    <li key={job.id}>
                      <JobCard
                        title={job.title}
                        location={job.location}
                        type={t(`careers.types.${job.type}`)}
                        href={`/careers/${job.id}#application`}
                        applyLabel={t('careers.apply')}
                        closesOn={job.closes_on}
                        closingLabel={t('careers.closes')}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('careers.noRoles')}</p>
              )
            ) : (
              <p aria-busy="true">{t('careers.loading')}</p>
            )}
            <h2>{t('careers.processHeading')}</h2>
            <CheckList
              label={t('careers.processHeading')}
              items={[0, 1, 2, 3, 4].map((i) => ({
                id: String(i),
                text: t(`careers.process.${i}`),
              }))}
            />
            <p className={styles.general}>
              <Link to="/careers/general#application">{t('careers.generalInterest')}</Link>
            </p>
          </div>
          <aside id="application" className={styles.form}>
            <h2>{t('careers.applicationHeading')}</h2>
            <p>{t('careers.applicationNote')}</p>
            <ApplicationForm jobs={jobs.data ?? []} />
          </aside>
        </div>
      </section>
      <CtaBand
        heading={t('careers.ctaHeading')}
        bookLabel={t('careers.ctaBook')}
        whatsappLabel={tc('actions.whatsapp')}
      />
    </>
  );
}
