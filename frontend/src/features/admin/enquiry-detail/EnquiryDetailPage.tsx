import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../../../types/api';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { formatUgPhone } from '../../../lib/phone';
import { whatsappUrl } from '../../../lib/whatsapp';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import styles from './EnquiryDetailPage.module.css';

type EnquiryDetail = components['schemas']['EnquiryDetail'];
type EnquiryUpdate = components['schemas']['EnquiryUpdate'];
type NoteIn = components['schemas']['NoteIn'];
const statusValues: EnquiryUpdate['status'][] = [
  'new',
  'contacted',
  'assessment_booked',
  'care_started',
  'not_proceeding',
  'spam',
];
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Kampala',
});
export function EnquiryDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('admin');
  const { t: tb } = useTranslation('booking');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['enquiries:write']);
  const [status, setStatus] = useState<EnquiryUpdate['status'] | null>(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const detail = useQuery({
    queryKey: ['admin', 'enquiry', id],
    queryFn: () => apiClient.get<EnquiryDetail>(`/admin/enquiries/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const update = useMutation({
    mutationFn: (body: EnquiryUpdate) =>
      apiClient.patch<EnquiryDetail>(`/admin/enquiries/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'enquiry', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'enquiries'] });
    },
  });
  const addNote = useMutation({
    mutationFn: (body: NoteIn) =>
      apiClient.post<EnquiryDetail>(`/admin/enquiries/${encodeURIComponent(id)}/notes`, body),
    onSuccess: async () => {
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'enquiry', id] });
    },
  });
  if (detail.isError)
    return (
      <div className={styles.state} role="alert">
        <p>{t('enquiryDetail.error')}</p>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  const item = detail.data;
  if (!item) return <p aria-busy="true">{t('enquiryDetail.loading')}</p>;
  const selectedStatus = status ?? item.status;
  const saveStatus = () =>
    update.mutate({
      status: selectedStatus,
      ...(assignedTo.trim() ? { assigned_to: assignedTo.trim() } : {}),
      ...(selectedStatus === 'not_proceeding' ? { reason } : { reason: null }),
    });
  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={t('enquiryDetail.received', {
          time: dateFormat.format(new Date(item.created_at)),
          source: t(`enquiries.sources.${item.source}`),
        })}
        actions={
          <Badge tone={item.status === 'new' ? 'new' : 'default'}>
            {t(`enquiries.statuses.${item.status}`)}
          </Badge>
        }
      />
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>{t('enquiryDetail.requestHeading')}</h2>
          <dl className={styles.details}>
            <div>
              <dt>{t('enquiries.columns.phone')}</dt>
              <dd>{formatUgPhone(item.phone_e164)}</dd>
            </div>
            <div>
              <dt>{t('enquiries.columns.area')}</dt>
              <dd>{item.area}</dd>
            </div>
            <div>
              <dt>{t('enquiryDetail.careNeeded')}</dt>
              <dd>{item.services.map((service) => service.name).join(', ')}</dd>
            </div>
            <div>
              <dt>{t('enquiryDetail.whoNeedsCare')}</dt>
              <dd>{tb(`relationshipOptions.${item.relationship}`)}</dd>
            </div>
            <div>
              <dt>{t('enquiryDetail.preferredStart')}</dt>
              <dd>
                {item.preferred_start
                  ? tb(`preferredStartOptions.${item.preferred_start}`)
                  : t('common.notProvided')}
              </dd>
            </div>
            <div>
              <dt>{t('enquiryDetail.source')}</dt>
              <dd>{t(`enquiries.sources.${item.source}`)}</dd>
            </div>
            <div className={styles.noteText}>
              <dt>{t('enquiryDetail.familyNote')}</dt>
              <dd>{item.note || t('common.notProvided')}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <Button href={`tel:${item.phone_e164}`}>{t('enquiryDetail.call')}</Button>
            <Button
              href={whatsappUrl(
                item.phone_e164.replace(/\D/g, ''),
                t('enquiryDetail.whatsappMessage'),
              )}
              variant="whatsapp"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('enquiryDetail.whatsapp')}
            </Button>
          </div>
        </section>
        <section className={styles.panel}>
          <h2>{t('enquiryDetail.statusHeading')}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveStatus();
            }}
            className={styles.form}
          >
            <Field
              disabled={!canWrite}
              kind="select"
              label={t('enquiryDetail.statusLabel')}
              value={status ?? item.status}
              onChange={(event) => setStatus(event.target.value as EnquiryUpdate['status'])}
            >
              {statusValues.map((value) => (
                <option key={value} value={value ?? ''}>
                  {t(`enquiries.statuses.${value}`)}
                </option>
              ))}
            </Field>
            <Field
              disabled={!canWrite}
              label={t('enquiryDetail.assignedTo')}
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              placeholder={item.assigned_to ?? t('enquiryDetail.unassigned')}
            />
            {(status ?? item.status) === 'not_proceeding' && (
              <Field
                disabled={!canWrite}
                kind="select"
                label={t('enquiryDetail.reason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                requiredLabel={t('common.required')}
              >
                <option value="">{t('enquiryDetail.chooseReason')}</option>
                {(['price', 'no_capacity', 'outside_area', 'other'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`enquiryDetail.reasons.${value}`)}
                  </option>
                ))}
              </Field>
            )}
            <Button
              type="submit"
              disabled={
                !canWrite ||
                update.isPending ||
                ((status ?? item.status) === 'not_proceeding' && !reason.trim())
              }
            >
              {update.isPending ? t('enquiryDetail.saving') : t('enquiryDetail.update')}
            </Button>
            {update.isError && <p role="alert">{t('enquiryDetail.updateError')}</p>}
          </form>
        </section>
        <section className={styles.panel}>
          <h2>{t('enquiryDetail.addNote')}</h2>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (note.trim()) addNote.mutate({ text: note.trim() });
            }}
          >
            <Field
              disabled={!canWrite}
              label={t('enquiryDetail.noteLabel')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              required
              requiredLabel={t('common.required')}
            />
            <Button type="submit" disabled={!canWrite || addNote.isPending || !note.trim()}>
              {addNote.isPending ? t('enquiryDetail.saving') : t('enquiryDetail.saveNote')}
            </Button>
            {addNote.isError && <p role="alert">{t('enquiryDetail.noteError')}</p>}
          </form>
        </section>
        <section className={styles.panel}>
          <h2>{t('enquiryDetail.timeline')}</h2>
          {item.events.length ? (
            <ol className={styles.timeline}>
              {item.events.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <time dateTime={event.at}>{dateFormat.format(new Date(event.at))}</time>
                  <p>{event.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t('enquiryDetail.noEvents')}</p>
          )}
        </section>
      </div>
    </>
  );
}
