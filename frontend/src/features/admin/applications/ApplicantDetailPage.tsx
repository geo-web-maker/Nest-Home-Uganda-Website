import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { formatUgPhone } from '../../../lib/phone';
import type {
  ApplicationDetail,
  ApplicationNote,
  ApplicationStage,
  ApplicationUpdate,
  CvLink,
} from './types';
import styles from './ApplicationsPage.module.css';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
const stageValues: ApplicationStage[] = [
  'received',
  'shortlisted',
  'interview',
  'checks',
  'offer',
  'hired',
  'declined',
];
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Kampala',
});
export function ApplicantDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasScopes(user, ['applications:write']);
  const [stage, setStage] = useState<ApplicationStage | null>(null);
  const [rating, setRating] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const item = useQuery({
    queryKey: ['admin', 'application', id],
    queryFn: () =>
      apiClient.get<ApplicationDetail>(`/admin/applications/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const update = useMutation({
    mutationFn: (body: ApplicationUpdate) =>
      apiClient.patch<ApplicationDetail>(`/admin/applications/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'application', id] });
      await client.invalidateQueries({ queryKey: ['admin', 'applications'] });
    },
  });
  const addNote = useMutation({
    mutationFn: (body: ApplicationNote) =>
      apiClient.post<ApplicationDetail>(
        `/admin/applications/${encodeURIComponent(id)}/notes`,
        body,
      ),
    onSuccess: async () => {
      setNote('');
      await client.invalidateQueries({ queryKey: ['admin', 'application', id] });
    },
  });
  const cv = useMutation({
    mutationFn: () => apiClient.get<CvLink>(`/admin/applications/${encodeURIComponent(id)}/cv`),
    onSuccess: (result) => {
      window.open(result.url, '_blank', 'noopener,noreferrer');
    },
  });
  if (item.isError)
    return (
      <div role="alert">
        <p>{t('applications.detail.error')}</p>
        <Button variant="outline" onClick={() => void item.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  if (!item.data) return <p aria-busy="true">{t('applications.detail.loading')}</p>;
  const application = item.data;
  const selectedStage = stage ?? application.stage;
  return (
    <>
      <PageHeader
        title={application.name}
        subtitle={t('applications.detail.subtitle', {
          role: application.job_title,
          applied: dateFormat.format(new Date(application.applied_at)),
        })}
        actions={<Badge>{t(`applications.stages.${application.stage}`)}</Badge>}
      />
      <div className={styles.detailGrid}>
        <section className={styles.panel}>
          <h2>{t('applications.detail.applicantInfo')}</h2>
          <dl className={styles.details}>
            {[
              ['phone', formatUgPhone(application.phone_e164)],
              ['email', application.email],
              ['registration', application.registration_number],
              ['qualification', application.qualification],
              [
                'experience',
                t('applications.experienceYears', { count: application.experience_years }),
              ],
              ['area', application.area],
              ['availability', application.availability],
              ['coverNote', application.cover_note || t('common.notProvided')],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{t(`applications.detail.fields.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <Button
            type="button"
            onClick={() => cv.mutate()}
            disabled={!application.cv_available || cv.isPending}
          >
            {cv.isPending ? t('applications.detail.loadingCv') : t('applications.detail.viewCv')}
          </Button>
          {cv.isError && <p role="alert">{t('applications.detail.cvError')}</p>}
        </section>
        <section className={styles.panel}>
          <h2>{t('applications.detail.review')}</h2>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({
                stage: selectedStage,
                rating: rating ? Number(rating) : application.rating,
                decline_reason: selectedStage === 'declined' ? reason : null,
              });
            }}
          >
            <Field
              disabled={!canWrite}
              kind="select"
              label={t('applications.detail.stage')}
              value={selectedStage}
              onChange={(event) => setStage(event.target.value as ApplicationStage)}
            >
              {stageValues.map((value) => (
                <option key={value} value={value}>
                  {t(`applications.stages.${value}`)}
                </option>
              ))}
            </Field>
            <Field
              disabled={!canWrite}
              kind="select"
              label={t('applications.detail.rating')}
              value={rating || String(application.rating ?? '')}
              onChange={(event) => setRating(event.target.value)}
            >
              <option value="">{t('common.notRated')}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Field>
            {selectedStage === 'declined' && (
              <Field
                disabled={!canWrite}
                label={t('applications.detail.declineReason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                requiredLabel={t('common.required')}
                maxLength={300}
              />
            )}
            {update.isError && <p role="alert">{t('applications.detail.updateError')}</p>}
            <Button
              type="submit"
              disabled={
                !canWrite || update.isPending || (selectedStage === 'declined' && !reason.trim())
              }
            >
              {t('applications.detail.save')}
            </Button>
          </form>
        </section>
        <section className={styles.panel}>
          <h2>{t('applications.detail.answers')}</h2>
          <dl className={styles.details}>
            {Object.entries(application.answers ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.panel}>
          <h2>{t('applications.detail.notes')}</h2>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (note.trim()) addNote.mutate({ text: note.trim() });
            }}
          >
            <Field
              disabled={!canWrite}
              label={t('applications.detail.addNote')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              requiredLabel={t('common.required')}
              maxLength={1000}
            />
            <Button type="submit" disabled={!canWrite || addNote.isPending || !note.trim()}>
              {t('applications.detail.saveNote')}
            </Button>
            {addNote.isError && <p role="alert">{t('applications.detail.noteError')}</p>}
          </form>
          <ol className={styles.timeline}>
            {application.events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <time dateTime={event.at}>{dateFormat.format(new Date(event.at))}</time>
                <p>{event.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
