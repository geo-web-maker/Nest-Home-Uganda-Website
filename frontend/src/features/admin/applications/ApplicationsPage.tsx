import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Pagination } from '../../../components/admin/Pagination';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { ApplicationItem, ApplicationPage, ApplicationStage } from './types';
const PAGE_SIZE = 25;
const stages: Array<ApplicationStage | ''> = [
  '',
  'received',
  'shortlisted',
  'interview',
  'checks',
  'offer',
  'hired',
];
const tone = (stage: ApplicationStage) =>
  stage === 'declined'
    ? 'red'
    : stage === 'shortlisted'
      ? 'blue'
      : stage === 'interview'
        ? 'purple'
        : stage === 'received'
          ? 'new'
          : 'default';
export function ApplicationsPage() {
  const { t } = useTranslation('admin');
  const [stage, setStage] = useState<ApplicationStage | ''>('');
  const [page, setPage] = useState(1);
  const applications = useQuery({
    queryKey: ['admin', 'applications', { stage, page }],
    queryFn: () =>
      apiClient.get<ApplicationPage>('/admin/applications', {
        params: { stage: stage || undefined, page, page_size: PAGE_SIZE },
      }),
  });
  const columns: DataColumn<ApplicationItem>[] = [
    { key: 'name', header: t('applications.columns.applicant'), cell: (row) => row.name },
    { key: 'job', header: t('applications.columns.role'), cell: (row) => row.job_title },
    {
      key: 'experience',
      header: t('applications.columns.experience'),
      cell: (row) => t('applications.experienceYears', { count: row.experience_years }),
    },
    {
      key: 'stage',
      header: t('applications.columns.stage'),
      cell: (row) => <Badge tone={tone(row.stage)}>{t(`applications.stages.${row.stage}`)}</Badge>,
    },
    {
      key: 'rating',
      header: t('applications.columns.rating'),
      cell: (row) => row.rating ?? t('common.notRated'),
    },
    {
      key: 'applied',
      header: t('applications.columns.applied'),
      cell: (row) =>
        new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium',
          timeZone: 'Africa/Kampala',
        }).format(new Date(row.applied_at)),
    },
  ];
  return (
    <>
      <PageHeader title={t('nav.applications')} subtitle={t('applications.subtitle')} />
      <FilterTabs
        label={t('applications.stageFilter')}
        value={stage}
        onChange={(value) => {
          setStage(value as ApplicationStage | '');
          setPage(1);
        }}
        tabs={stages.map((value) => ({ value, label: t(`applications.tabs.${value || 'all'}`) }))}
      />
      {applications.isError ? (
        <div role="alert">
          <p>{t('applications.error')}</p>
          <Button variant="outline" onClick={() => void applications.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={applications.data?.items ?? []}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/admin/applications/${row.id}`}
            loading={applications.isFetching}
            labels={{
              caption: t('applications.table.caption'),
              loading: t('applications.table.loading'),
              empty: t('applications.table.empty'),
            }}
          />
          <Pagination
            page={page}
            pageSize={applications.data?.page_size ?? PAGE_SIZE}
            total={applications.data?.total ?? 0}
            onChange={setPage}
            labels={{
              nav: t('applications.pagination.nav'),
              previous: t('applications.pagination.previous'),
              next: t('applications.pagination.next'),
              summary: (from, to, total) =>
                t('applications.pagination.summary', { from, to, total }),
            }}
          />
        </>
      )}
    </>
  );
}
