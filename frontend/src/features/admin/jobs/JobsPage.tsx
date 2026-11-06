import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Pagination } from '../../../components/admin/Pagination';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { JobAdmin, JobPage } from './types';
import styles from './JobsPage.module.css';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
export function JobsPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['jobs:write']);
  const [page, setPage] = useState(1);
  const jobs = useQuery({
    queryKey: ['admin', 'jobs', page],
    queryFn: () => apiClient.get<JobPage>('/admin/jobs', { params: { page, page_size: 25 } }),
  });
  const columns: DataColumn<JobAdmin>[] = [
    {
      key: 'title',
      header: t('jobs.columns.title'),
      cell: (item) => item.title.en ?? Object.values(item.title)[0] ?? t('common.notProvided'),
    },
    { key: 'location', header: t('jobs.columns.location'), cell: (item) => item.location },
    { key: 'type', header: t('jobs.columns.type'), cell: (item) => t(`jobs.types.${item.type}`) },
    {
      key: 'closing',
      header: t('jobs.columns.closing'),
      cell: (item) => item.closes_on ?? t('common.notProvided'),
    },
    {
      key: 'applicants',
      header: t('jobs.columns.applicants'),
      cell: (item) => item.applicants_count,
    },
    {
      key: 'published',
      header: t('jobs.columns.status'),
      cell: (item) => (
        <Badge tone={item.published ? 'default' : 'new'}>
          {item.published ? t('jobs.published') : t('jobs.draft')}
        </Badge>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={t('nav.careers')}
        subtitle={t('jobs.subtitle')}
        actions={
          canWrite ? <Button href="/admin/careers/new">{t('jobs.newJob')}</Button> : undefined
        }
      />
      {jobs.isError ? (
        <div className={styles.error} role="alert">
          <p>{t('jobs.error')}</p>
          <Button variant="outline" onClick={() => void jobs.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={jobs.data?.items ?? []}
            getRowKey={(item) => item.id}
            getRowHref={(item) => `/admin/careers/${item.id}`}
            loading={jobs.isFetching}
            labels={{
              caption: t('jobs.table.caption'),
              loading: t('jobs.table.loading'),
              empty: t('jobs.table.empty'),
            }}
          />
          <Pagination
            page={page}
            pageSize={jobs.data?.page_size ?? 25}
            total={jobs.data?.total ?? 0}
            onChange={setPage}
            labels={{
              nav: t('jobs.pagination.nav'),
              previous: t('jobs.pagination.previous'),
              next: t('jobs.pagination.next'),
              summary: (from, to, total) => t('jobs.pagination.summary', { from, to, total }),
            }}
          />
        </>
      )}
    </>
  );
}
