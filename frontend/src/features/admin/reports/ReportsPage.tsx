import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBar } from '../../../components/admin/FilterBar';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { authStore } from '../auth/authStore';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import type { ExportFormat, ExportType, ReportsSummary } from './types';
import styles from './ReportsPage.module.css';
export function ReportsPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const canExport = hasScopes(user, ['reports:export']);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<ExportType>('enquiries');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exportError, setExportError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const report = useQuery({
    queryKey: ['admin', 'reports', 'summary'],
    queryFn: () => apiClient.get<ReportsSummary>('/admin/reports/summary'),
  });
  const download = async () => {
    setExportError(false);
    setExporting(true);
    try {
      const params = new URLSearchParams({
        type: kind,
        format,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? ''}/api/v1/admin/reports/export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${authStore.getAccessToken() ?? ''}`,
            Accept:
              format === 'csv'
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error('export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${kind}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <PageHeader title={t('nav.reports')} subtitle={t('reports.subtitle')} />
      {report.isError ? (
        <div role="alert">
          <p>{t('reports.error')}</p>
          <Button variant="outline" onClick={() => void report.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !report.data ? (
        <p aria-busy="true">{t('reports.loading')}</p>
      ) : (
        <>
          <section className={styles.stats} aria-label={t('reports.statsLabel')}>
            <article>
              <p>{t('reports.stats.enquiries')}</p>
              <strong>{report.data.enquiries_this_month}</strong>
            </article>
            <article>
              <p>{t('reports.stats.reached')}</p>
              <strong>{report.data.reached_assessment_percent}%</strong>
            </article>
            <article>
              <p>{t('reports.stats.reply')}</p>
              <strong>
                {report.data.average_first_reply_minutes === null
                  ? t('common.notProvided')
                  : t('reports.minutes', { count: report.data.average_first_reply_minutes })}
              </strong>
            </article>
            <article>
              <p>{t('reports.stats.applications')}</p>
              <strong>{report.data.applications_count}</strong>
            </article>
          </section>
          <section className={styles.panel}>
            <h2>{t('reports.servicesHeading')}</h2>
            <ul className={styles.bars}>
              {report.data.most_requested_services.slice(0, 4).map((item) => (
                <li key={item.name}>
                  <div className={styles.barLabel}>
                    <span>{item.name}</span>
                    <strong>{item.percentage}%</strong>
                  </div>
                  <span className={styles.track}>
                    <span
                      className={styles.fill}
                      style={{ width: `${Math.max(0, Math.min(100, item.percentage))}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section className={styles.panel}>
        <h2>{t('reports.exportHeading')}</h2>
        <FilterBar
          label={t('reports.exportLabel')}
          onSubmit={() => {
            if (canExport) void download();
          }}
          actions={
            <Button type="submit" disabled={!canExport || exporting}>
              {exporting ? t('reports.downloading') : t('reports.download')}
            </Button>
          }
        >
          <Field
            kind="select"
            label={t('reports.dataType')}
            value={kind}
            onChange={(event) => setKind(event.target.value as ExportType)}
          >
            <option value="enquiries">{t('reports.data.enquiries')}</option>
            <option value="applications">{t('reports.data.applications')}</option>
            <option value="activity">{t('reports.data.activity')}</option>
          </Field>
          <Field
            label={t('reports.from')}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Field
            label={t('reports.to')}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
          <Field
            kind="select"
            label={t('reports.format')}
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
          >
            <option value="csv">{t('reports.csv')}</option>
            <option value="xlsx">{t('reports.excel')}</option>
          </Field>
        </FilterBar>
        {exportError && <p role="alert">{t('reports.exportError')}</p>}
      </section>
    </>
  );
}
