import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Checkbox } from '../../../components/ui/Checkbox';
import { apiClient } from '../../../lib/api/client';
import type { JobAdmin, JobInput } from './types';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import styles from './JobsPage.module.css';
const initial: JobInput = {
  title: '',
  department: 'clinical',
  location: '',
  type: 'full_time',
  closes_on: null,
  registration_required: false,
  description: 'client to supply',
  requirements: 'client to supply',
  show_closing: true,
  published: false,
};
export function JobEditorPage() {
  const { id = '' } = useParams();
  const isNew = id === '' || id === 'new';
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['jobs:write']);
  const [form, setForm] = useState<JobInput>(initial);
  const query = useQuery({
    queryKey: ['admin', 'job', id],
    enabled: !isNew,
    queryFn: () => apiClient.get<JobAdmin>(`/admin/jobs/${encodeURIComponent(id)}`),
    select: (item) => ({
      title: item.title.en ?? 'client to supply',
      department: item.department,
      location: item.location,
      type: item.type,
      closes_on: item.closes_on,
      registration_required: item.registration_required,
      description: item.description.en ?? 'client to supply',
      requirements: item.requirements.en ?? 'client to supply',
      show_closing: item.show_closing,
      published: item.published,
    }),
  });
  useEffect(() => {
    if (!isNew && query.data) setForm(query.data);
  }, [id, isNew, query.data]);
  const save = useMutation({
    mutationFn: async (payload: JobInput) => {
      const { published, title, description, requirements, ...rest } = payload;
      const body = {
        ...rest,
        title: { en: title },
        description: { en: description },
        requirements: { en: requirements },
      };
      let item: JobAdmin;
      if (isNew) {
        item = await apiClient.post<JobAdmin>('/admin/jobs', { ...body, published: false });
      } else {
        item = await apiClient.patch<JobAdmin>(`/admin/jobs/${encodeURIComponent(id)}`, body);
      }
      const wasPublished = !isNew && Boolean(query.data?.published);
      if (published && !wasPublished) {
        item = await apiClient.post<JobAdmin>(
          `/admin/jobs/${encodeURIComponent(item.id)}/publish`,
          {},
        );
      } else if (!published && wasPublished) {
        item = await apiClient.patch<JobAdmin>(`/admin/jobs/${encodeURIComponent(item.id)}`, {
          published: false,
        });
      }
      return item;
    },
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      await client.invalidateQueries({ queryKey: ['admin', 'job', item.id] });
      navigate(`/admin/careers/${item.id}`, { replace: true });
    },
  });
  const close = useMutation({
    mutationFn: () => apiClient.post<JobAdmin>(`/admin/jobs/${encodeURIComponent(id)}/close`, {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      await query.refetch();
    },
  });
  const change = <K extends keyof JobInput>(key: K, value: JobInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <>
      <PageHeader
        title={isNew ? t('jobs.editor.newTitle') : t('jobs.editor.title')}
        subtitle={t('jobs.editor.subtitle')}
      />
      {query.isError && <p role="alert">{t('jobs.editor.loadError')}</p>}
      <form
        className={styles.editor}
        onSubmit={(event) => {
          event.preventDefault();
          if (canWrite) save.mutate(form);
        }}
      >
        <Field
          label={t('jobs.editor.titleLabel')}
          required
          requiredLabel={t('common.required')}
          value={form.title}
          disabled={!canWrite}
          onChange={(event) => change('title', event.target.value)}
          maxLength={120}
        />
        <Field
          kind="select"
          label={t('jobs.editor.department')}
          value={form.department}
          disabled={!canWrite}
          onChange={(event) => change('department', event.target.value as JobInput['department'])}
        >
          {(['clinical', 'care', 'admin'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`jobs.departments.${value}`)}
            </option>
          ))}
        </Field>
        <Field
          label={t('jobs.columns.location')}
          required
          requiredLabel={t('common.required')}
          value={form.location}
          disabled={!canWrite}
          onChange={(event) => change('location', event.target.value)}
          maxLength={100}
        />
        <Field
          kind="select"
          label={t('jobs.columns.type')}
          value={form.type}
          disabled={!canWrite}
          onChange={(event) => change('type', event.target.value as JobInput['type'])}
        >
          {(['full_time', 'part_time', 'contract'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`jobs.types.${value}`)}
            </option>
          ))}
        </Field>
        <Field
          label={t('jobs.editor.closingDate')}
          type="date"
          value={form.closes_on ?? ''}
          disabled={!canWrite}
          onChange={(event) => change('closes_on', event.target.value || null)}
        />
        <Field
          kind="textarea"
          label={t('jobs.editor.description')}
          value={form.description}
          disabled={!canWrite}
          onChange={(event) => change('description', event.target.value)}
          rows={6}
        />
        <Field
          kind="textarea"
          label={t('jobs.editor.requirements')}
          value={form.requirements}
          disabled={!canWrite}
          onChange={(event) => change('requirements', event.target.value)}
          rows={6}
        />
        <Checkbox
          label={t('jobs.editor.registrationRequired')}
          checked={form.registration_required}
          disabled={!canWrite}
          onChange={(event) => change('registration_required', event.target.checked)}
        />
        <Checkbox
          label={t('jobs.editor.showClosingDate')}
          checked={form.show_closing}
          disabled={!canWrite}
          onChange={(event) => change('show_closing', event.target.checked)}
        />
        <Checkbox
          label={t('jobs.editor.published')}
          checked={form.published}
          disabled={!canWrite}
          onChange={(event) => change('published', event.target.checked)}
        />
        {save.isError && <p role="alert">{t('jobs.editor.saveError')}</p>}
        <div className={styles.actions}>
          <Button type="submit" disabled={!canWrite || save.isPending}>
            {save.isPending
              ? t('jobs.editor.saving')
              : form.published
                ? t('jobs.editor.savePublish')
                : t('jobs.editor.saveDraft')}
          </Button>
          {!isNew && (
            <Button
              type="button"
              variant="outline"
              disabled={!canWrite || close.isPending}
              onClick={() => close.mutate()}
            >
              {t('jobs.editor.closeJob')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate('/admin/careers')}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </>
  );
}
