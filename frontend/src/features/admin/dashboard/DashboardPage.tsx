import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { DashboardData } from './types';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { t } = useTranslation('admin');
  const data = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/admin/dashboard'),
  });
  const stats = data.data?.stats;
  const cards = stats
    ? [
        { key: 'newEnquiries', value: stats.new_enquiries_this_week },
        {
          key: 'unanswered',
          value: stats.unanswered_over_reminder_minutes,
          detail: t('dashboard.overMinutes', { minutes: stats.reminder_minutes }),
        },
        { key: 'applications', value: stats.applications_waiting },
        { key: 'careStarted', value: stats.care_started_this_month },
      ]
    : [];
  const maximum = Math.max(1, ...(data.data?.enquiries_per_day.map((item) => item.count) ?? []));
  return (
    <>
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={t('dashboard.subtitle')}
        actions={<Button href="/admin/enquiries">{t('dashboard.viewEnquiries')}</Button>}
      />
      {data.isError ? (
        <div className={styles.error} role="alert">
          <p>{t('dashboard.error')}</p>
          <Button variant="outline" onClick={() => void data.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data.data ? (
        <p aria-busy="true">{t('dashboard.loading')}</p>
      ) : (
        <>
          <section className={styles.stats} aria-label={t('dashboard.statsLabel')}>
            {cards.map((card) => (
              <article className={styles.stat} key={card.key}>
                <p>{t(`dashboard.stats.${card.key}`)}</p>
                <strong>{card.value}</strong>
                {'detail' in card && card.detail ? <span>{card.detail}</span> : null}
              </article>
            ))}
          </section>
          <div className={styles.columns}>
            <section className={styles.panel}>
              <h2>{t('dashboard.perDay')}</h2>
              <ul className={styles.chart} aria-label={t('dashboard.perDay')}>
                {data.data.enquiries_per_day.map((item) => (
                  <li key={item.date}>
                    <span>{item.date}</span>
                    <span className={styles.track}>
                      <span
                        className={styles.bar}
                        style={{ width: `${(item.count / maximum) * 100}%` }}
                      />
                    </span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.panel}>
              <h2>{t('dashboard.needsReply')}</h2>
              {data.data.needs_reply.length ? (
                <ul className={styles.list}>
                  {data.data.needs_reply.map((item) => (
                    <li key={item.id}>
                      <Link to={`/admin/enquiries/${item.id}`}>
                        <strong>{item.name}</strong>
                        <span>
                          {item.service} · {item.area}
                        </span>
                      </Link>
                      <Badge tone="new">{t('enquiries.statuses.new')}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('dashboard.noneNeedReply')}</p>
              )}
              <h2>{t('dashboard.waitingApplications')}</h2>
              {data.data.applications_waiting_by_job.length ? (
                <ul className={styles.list}>
                  {data.data.applications_waiting_by_job.map((item) => (
                    <li key={item.job_id}>
                      <span>{item.job_title}</span>
                      <Badge>{t('dashboard.reviewCount', { count: item.count })}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('dashboard.noneWaiting')}</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
