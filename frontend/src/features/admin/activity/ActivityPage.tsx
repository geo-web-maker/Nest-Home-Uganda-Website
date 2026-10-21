import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Pagination } from '../../../components/admin/Pagination';
import { Field } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import type { ActivityItem, ActivityPage } from './types';
import styles from './ActivityPage.module.css';
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Kampala',
});
export function ActivityPage() {
  const { t } = useTranslation('admin');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const activity = useQuery({
    queryKey: ['admin', 'activity', { from, to, page }],
    queryFn: () =>
      apiClient.get<ActivityPage>('/admin/activity', {
        params: { from: from || undefined, to: to || undefined, page, page_size: 25 },
      }),
  });
  const columns: DataColumn<ActivityItem>[] = [
    {
      key: 'at',
      header: t('activity.columns.when'),
      cell: (item) => dateFormat.format(new Date(item.at)),
    },
    {
      key: 'user',
      header: t('activity.columns.user'),
      cell: (item) => item.user_name || t('activity.system'),
    },
    { key: 'action', header: t('activity.columns.action'), cell: (item) => item.action },
    {
      key: 'item',
      header: t('activity.columns.item'),
      cell: (item) => [item.item_type, item.item_label].filter(Boolean).join(': '),
    },
  ];
  return (
    <>
      <PageHeader title={t('nav.activity')} subtitle={t('activity.subtitle')} />
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <Field
          label={t('activity.from')}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
        />
        <Field
          label={t('activity.to')}
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
        />
        <Button type="submit">{t('activity.apply')}</Button>
      </form>
      {activity.isError ? (
        <div className={styles.error} role="alert">
          <p>{t('activity.error')}</p>
          <Button variant="outline" onClick={() => void activity.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={activity.data?.items ?? []}
            getRowKey={(item) => item.id}
            loading={activity.isFetching}
            labels={{
              caption: t('activity.table.caption'),
              loading: t('activity.table.loading'),
              empty: t('activity.table.empty'),
            }}
          />
          <Pagination
            page={page}
            pageSize={activity.data?.page_size ?? 25}
            total={activity.data?.total ?? 0}
            onChange={setPage}
            labels={{
              nav: t('activity.pagination.nav'),
              previous: t('activity.pagination.previous'),
              next: t('activity.pagination.next'),
              summary: (start, end, total) =>
                t('activity.pagination.summary', { from: start, to: end, total }),
            }}
          />
        </>
      )}
    </>
  );
}
