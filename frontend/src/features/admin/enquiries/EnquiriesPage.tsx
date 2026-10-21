import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Pagination } from '../../../components/admin/Pagination';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { formatUgPhone } from '../../../lib/phone';
import { useServices } from '../../../lib/queries/services';
import type { EnquiryListItem } from '../../../types';
import styles from './EnquiriesPage.module.css';
import {
  ENQUIRIES_PAGE_SIZE,
  useEnquiries,
  type EnquiryFilters,
  type EnquirySort,
} from './useEnquiries';

const TAB_VALUES = ['', 'new', 'contacted', 'assessment_booked', 'care_started', 'not_proceeding'];

const TONES: Record<string, BadgeTone> = {
  new: 'new',
  contacted: 'blue',
  assessment_booked: 'purple',
  care_started: 'default',
  not_proceeding: 'red',
  spam: 'red',
};

const LIST_ID = 'enquiries-list';

const receivedFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Kampala',
});

/** The list state lives in the URL, so a back button from a detail screen keeps the filters. */
function readFilters(params: URLSearchParams): EnquiryFilters {
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    service: params.get('service') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: params.get('sort') === 'created_at' ? 'created_at' : '-created_at',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Enquiries list (spec 7.4). Needs `enquiries:read`. Export CSV is not built (S4 deviation 7). */
export function EnquiriesPage() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const enquiries = useEnquiries(filters);
  const services = useServices();

  // Any change except the page itself goes back to page 1.
  const update = (patch: Partial<Record<keyof EnquiryFilters, string | number>>) => {
    const next = new URLSearchParams(params);
    if (!('page' in patch)) next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === undefined || (key === 'page' && value === 1)) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  const columns: DataColumn<EnquiryListItem>[] = [
    { key: 'name', header: t('enquiries.columns.name'), cell: (row) => row.name },
    {
      key: 'phone',
      header: t('enquiries.columns.phone'),
      cell: (row) => formatUgPhone(row.phone_e164),
    },
    {
      key: 'service',
      header: t('enquiries.columns.service'),
      cell: (row) => row.services.map((service) => service.name).join(', '),
    },
    { key: 'area', header: t('enquiries.columns.area'), cell: (row) => row.area },
    {
      key: 'status',
      header: t('enquiries.columns.status'),
      cell: (row) => (
        <Badge tone={TONES[row.status] ?? 'default'}>{t(`enquiries.statuses.${row.status}`)}</Badge>
      ),
    },
    {
      key: 'received',
      header: t('enquiries.columns.received'),
      cell: (row) => receivedFormat.format(new Date(row.created_at)),
    },
    {
      // Only the user id comes back, and looking up names needs `users:read`, so no name is shown yet.
      key: 'assigned',
      header: t('enquiries.columns.assigned'),
      cell: (row) => (row.assigned_to ? t('enquiries.assigned') : t('enquiries.unassigned')),
    },
  ];

  const data = enquiries.data;

  return (
    <>
      <PageHeader title={t('nav.enquiries')} />

      <form
        role="search"
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          update({ q: typeof value === 'string' ? value.trim() : '' });
        }}
      >
        <div className={styles.searchRow}>
          <Field
            key={filters.q}
            type="search"
            name="q"
            label={t('enquiries.search')}
            placeholder={t('enquiries.searchPlaceholder')}
            defaultValue={filters.q}
            maxLength={80}
            className={styles.search}
          />
          <Button type="submit">{t('enquiries.searchButton')}</Button>
        </div>
        <div className={styles.row}>
          <Field
            kind="select"
            label={t('enquiries.service')}
            value={filters.service}
            onChange={(event) => update({ service: event.target.value })}
          >
            <option value="">{t('enquiries.allServices')}</option>
            {services.data?.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Field>
          <Field
            type="date"
            label={t('enquiries.from')}
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => update({ from: event.target.value })}
          />
          <Field
            type="date"
            label={t('enquiries.to')}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => update({ to: event.target.value })}
          />
          <Field
            kind="select"
            label={t('enquiries.sort')}
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value as EnquirySort })}
          >
            <option value="-created_at">{t('enquiries.newest')}</option>
            <option value="created_at">{t('enquiries.oldest')}</option>
          </Field>
        </div>
      </form>

      <FilterTabs
        label={t('enquiries.statusFilter')}
        controls={LIST_ID}
        value={filters.status}
        onChange={(status) => update({ status })}
        tabs={TAB_VALUES.map((value) => ({
          value,
          label: t(`enquiries.tabs.${value || 'all'}`),
        }))}
      />

      {enquiries.isError && !data ? (
        <div className={styles.error} role="alert">
          <p>{t('enquiries.error')}</p>
          <Button type="button" variant="outline" onClick={() => void enquiries.refetch()}>
            {t('enquiries.retry')}
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            id={LIST_ID}
            columns={columns}
            rows={data?.items ?? []}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/admin/enquiries/${row.id}`}
            loading={enquiries.isFetching}
            labels={{
              caption: t('enquiries.table.caption'),
              loading: t('enquiries.table.loading'),
              empty: t('enquiries.table.empty'),
            }}
          />
          <Pagination
            page={filters.page}
            pageSize={data?.page_size ?? ENQUIRIES_PAGE_SIZE}
            total={data?.total ?? 0}
            onChange={(page) => update({ page })}
            labels={{
              nav: t('enquiries.pagination.nav'),
              previous: t('enquiries.pagination.previous'),
              next: t('enquiries.pagination.next'),
              summary: (from, to, total) => t('enquiries.pagination.summary', { from, to, total }),
            }}
          />
        </>
      )}
    </>
  );
}
