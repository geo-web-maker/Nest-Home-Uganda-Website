import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field, requiredProps } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import type { ContentField, ContentKind, ContentList, ContentRecord } from './types';
import styles from './ContentPage.module.css';

const tabs: ContentKind[] = [
  'services',
  'team',
  'faqs',
  'testimonials',
  'areas',
  'pricing',
  'articles',
  'pages',
  'media',
];
const fields: Record<ContentKind, ContentField[]> = {
  services: [
    { key: 'slug', kind: 'text', required: true },
    { key: 'name', kind: 'localized', required: true },
    { key: 'summary', kind: 'localized' },
    { key: 'number', kind: 'number' },
    { key: 'hero_label', kind: 'localized' },
    { key: 'hero_headline', kind: 'localized' },
    { key: 'hero_lead', kind: 'localized' },
    { key: 'facts', kind: 'lines' },
    { key: 'who_for', kind: 'lines' },
    { key: 'includes', kind: 'lines' },
    { key: 'how_often', kind: 'localized' },
    { key: 'icon_key', kind: 'text' },
    { key: 'related', kind: 'lines' },
    { key: 'seo_title', kind: 'localized' },
    { key: 'seo_description', kind: 'localized' },
    { key: 'sort_order', kind: 'number' },
    { key: 'published', kind: 'boolean' },
  ],
  team: [
    { key: 'name', kind: 'text', required: true },
    { key: 'role', kind: 'localized', required: true },
    { key: 'qualification', kind: 'localized', required: true },
    { key: 'registration_number', kind: 'text' },
    { key: 'bio', kind: 'localized' },
    { key: 'photo_media_id', kind: 'text' },
    { key: 'sort_order', kind: 'number' },
    { key: 'published', kind: 'boolean' },
  ],
  faqs: [
    { key: 'question', kind: 'localized', required: true },
    { key: 'answer', kind: 'localized' },
    { key: 'service_id', kind: 'text' },
    { key: 'sort_order', kind: 'number' },
    { key: 'published', kind: 'boolean' },
  ],
  testimonials: [
    { key: 'first_name', kind: 'text', required: true },
    { key: 'area', kind: 'text', required: true },
    { key: 'quote', kind: 'localized', required: true },
    { key: 'permission_received', kind: 'boolean', required: true },
    { key: 'approved', kind: 'boolean' },
  ],
  areas: [
    { key: 'name', kind: 'text', required: true },
    { key: 'aliases', kind: 'lines' },
    { key: 'sort_order', kind: 'number' },
  ],
  pricing: [
    { key: 'key', kind: 'text', required: true },
    { key: 'tag', kind: 'localized' },
    { key: 'title', kind: 'localized', required: true },
    { key: 'text', kind: 'localized' },
    { key: 'price_text', kind: 'localized' },
    { key: 'show', kind: 'boolean' },
    { key: 'sort_order', kind: 'number' },
  ],
  articles: [
    { key: 'slug', kind: 'text', required: true },
    { key: 'title', kind: 'localized', required: true },
    { key: 'body', kind: 'localized' },
    { key: 'image_media_id', kind: 'text' },
    { key: 'published_at', kind: 'text' },
  ],
  pages: [
    { key: 'key', kind: 'text', required: true },
    { key: 'title', kind: 'localized', required: true },
    { key: 'body', kind: 'localized' },
    { key: 'published', kind: 'boolean' },
  ],
  media: [{ key: 'alt_text', kind: 'localized', required: true }],
};
const statusKey: Partial<Record<ContentKind, string>> = {
  services: 'published',
  team: 'published',
  faqs: 'published',
  testimonials: 'approved',
  pricing: 'show',
  pages: 'published',
};
function recordList(data: ContentList | undefined): ContentRecord[] {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}
function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return value.map(display).join('\n');
  if (typeof value === 'object' && 'en' in value)
    return String((value as Record<string, unknown>).en ?? '');
  return JSON.stringify(value);
}
function buildBody(
  kind: ContentKind,
  form: Record<string, string | boolean>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields[kind]) {
    const value = form[field.key];
    if (value === undefined || value === '') continue;
    if (field.kind === 'localized') body[field.key] = { en: String(value) };
    else if (field.kind === 'boolean') body[field.key] = Boolean(value);
    else if (field.kind === 'number') body[field.key] = Number(value);
    else if (field.kind === 'lines') {
      const lines = String(value)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      body[field.key] =
        kind === 'services' && ['facts', 'who_for', 'includes'].includes(field.key)
          ? lines.map((line) => ({ en: line }))
          : lines;
    } else body[field.key] = value;
  }
  return body;
}
export function ContentPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const tab = tabs.includes(params.get('tab') as ContentKind)
    ? (params.get('tab') as ContentKind)
    : 'services';
  const [selected, setSelected] = useState<ContentRecord | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const canWrite = hasScopes(user, ['content:write']);
  const canPublish = hasScopes(user, ['content:publish']);
  const itemsQuery = useQuery({
    queryKey: ['admin', 'content', tab],
    queryFn: () =>
      apiClient.get<ContentList>(`/admin/${tab}`, { params: { page: 1, page_size: 100 } }),
  });
  const items = useMemo(() => recordList(itemsQuery.data), [itemsQuery.data]);
  const save = useMutation({
    mutationFn: () =>
      selected
        ? apiClient.patch<ContentRecord>(
            `/admin/${tab}/${encodeURIComponent(selected.id)}`,
            buildBody(tab, form),
          )
        : apiClient.post<ContentRecord>(`/admin/${tab}`, buildBody(tab, form)),
    onSuccess: async () => {
      setSelected(null);
      setForm({});
      setEditorOpen(false);
      await client.invalidateQueries({ queryKey: ['admin', 'content', tab] });
    },
  });
  const columns: DataColumn<ContentRecord>[] = [
    {
      key: 'title',
      header: t('content.columns.title'),
      cell: (row) =>
        display(
          row.name ??
            row.title ??
            row.question ??
            row.first_name ??
            row.key ??
            row.slug ??
            row.alt_text,
        ) || t('content.untitled'),
    },
    {
      key: 'status',
      header: t('content.columns.status'),
      cell: (row) => {
        const key = statusKey[tab];
        if (!key) return t('content.notApplicable');
        const live = Boolean(row[key]);
        return (
          <Badge tone={live ? 'default' : 'new'}>
            {live ? t('content.published') : t('content.draft')}
          </Badge>
        );
      },
    },
    {
      key: 'order',
      header: t('content.columns.order'),
      cell: (row) => display(row.sort_order ?? row.number),
    },
    {
      key: 'actions',
      header: t('content.columns.actions'),
      cell: (row) => (
        <div className={styles.rowActions}>
          <Button
            variant="outline"
            disabled={!canWrite}
            onClick={() => {
              setSelected(row);
              setEditorOpen(true);
              const next: Record<string, string | boolean> = {};
              for (const field of fields[tab]) {
                const value = (row as Record<string, unknown>)[field.key];
                next[field.key] = field.kind === 'boolean' ? Boolean(value) : display(value);
              }
              setForm(next);
            }}
          >
            {t('content.edit')}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={t('nav.content')}
        subtitle={t('content.subtitle')}
        actions={
          canWrite && tab !== 'media' ? (
            <Button
              onClick={() => {
                setSelected(null);
                setForm({});
                setEditorOpen(true);
              }}
            >
              {t('content.newItem')}
            </Button>
          ) : undefined
        }
      />
      <FilterTabs
        label={t('content.tabsLabel')}
        value={tab}
        tabs={tabs.map((kind) => ({ value: kind, label: t(`content.tabs.${kind}`) }))}
        onChange={(value) => {
          setParams({ tab: value });
          setSelected(null);
          setForm({});
          setEditorOpen(false);
        }}
      />
      {itemsQuery.isError ? (
        <div role="alert">
          <p>{t('content.error')}</p>
          <Button variant="outline" onClick={() => void itemsQuery.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(row) => row.id}
          loading={itemsQuery.isFetching}
          labels={{
            caption: t('content.table.caption'),
            loading: t('content.table.loading'),
            empty: t('content.table.empty'),
          }}
        />
      )}
      {editorOpen && selected?.id && tab === 'media' ? null : editorOpen && tab !== 'media' ? (
        <section className={styles.editor}>
          <h2>{selected ? t('content.editItem') : t('content.newItem')}</h2>
          <form
            className={styles.fields}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {fields[tab].map((field) =>
              field.kind === 'boolean' ? (
                <label className={styles.check} key={field.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(form[field.key])}
                    disabled={
                      !canWrite ||
                      (field.key === statusKey[tab] &&
                        !canPublish &&
                        tab !== 'testimonials' &&
                        tab !== 'pricing')
                    }
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [field.key]: event.target.checked }))
                    }
                  />
                  {t(`content.fields.${field.key}`)}
                </label>
              ) : (
                <Field
                  key={field.key}
                  {...(field.kind === 'textarea' ||
                  field.kind === 'lines' ||
                  field.kind === 'localized'
                    ? { kind: 'textarea' as const, rows: 3 }
                    : { type: field.kind === 'number' ? ('number' as const) : ('text' as const) })}
                  label={t(`content.fields.${field.key}`)}
                  {...requiredProps(field.required, t('common.required'))}
                  value={form[field.key] === undefined ? '' : String(form[field.key])}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setForm((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                  disabled={
                    !canWrite || (tab === 'articles' && field.key === 'published_at' && !canPublish)
                  }
                />
              ),
            )}
            {save.isError && <p role="alert">{t('content.saveError')}</p>}
            <div className={styles.rowActions}>
              <Button type="submit" disabled={!canWrite || save.isPending}>
                {save.isPending ? t('content.saving') : t('content.saveDraft')}
              </Button>
              {canWrite && canPublish && statusKey[tab] && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const key = statusKey[tab] as string;
                    setForm((current) => ({ ...current, [key]: true }));
                    save.mutate();
                  }}
                >
                  {t('content.publish')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelected(null);
                  setForm({});
                  setEditorOpen(false);
                }}
              >
                {t('common.cancel')}
              </Button>
              {selected && (
                <a
                  href={
                    tab === 'services'
                      ? `/services/${encodeURIComponent(String(selected.slug ?? ''))}`
                      : tab === 'articles'
                        ? `/faq/${encodeURIComponent(String(selected.slug ?? ''))}`
                        : `/${tab}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('content.preview')}
                </a>
              )}
            </div>
          </form>
        </section>
      ) : tab === 'media' ? (
        <p className={styles.note}>{t('content.mediaUploadNote')}</p>
      ) : null}
    </>
  );
}
