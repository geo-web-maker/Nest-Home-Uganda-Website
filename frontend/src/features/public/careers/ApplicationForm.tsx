import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, requiredProps } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import type { JobPublic } from './types';
import styles from './ApplicationForm.module.css';

type ApplicationValues = {
  job_id: string;
  name: string;
  phone: string;
  email: string;
  registration_number: string;
  qualification: string;
  experience_years: string;
  area: string;
  availability: string;
  cover_note: string;
  consent: boolean;
};
type ApplicationFormProps = { jobs: ReadonlyArray<JobPublic>; selectedJobId?: string | null };
const emptyValues: ApplicationValues = {
  job_id: '',
  name: '',
  phone: '',
  email: '',
  registration_number: '',
  qualification: '',
  experience_years: '',
  area: '',
  availability: '',
  cover_note: '',
  consent: false,
};
export function ApplicationForm({ jobs, selectedJobId = null }: ApplicationFormProps) {
  const { t } = useTranslation('site');
  const [values, setValues] = useState<ApplicationValues>({
    ...emptyValues,
    job_id: selectedJobId ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'editing' | 'sending' | 'success' | 'error' | 'rateLimited'>(
    'editing',
  );
  const [fieldError, setFieldError] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedJob = jobs.find((job) => job.id === values.job_id);
  const registrationRequired = selectedJob?.registration_required === true;
  useEffect(() => {
    if (phase === 'success') headingRef.current?.focus();
  }, [phase]);
  const update = (key: keyof ApplicationValues, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError('');
    if (!file) {
      setFieldError(t('careers.form.fileRequired'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFieldError(t('careers.form.fileSize'));
      return;
    }
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) {
      setFieldError(t('careers.form.fileType'));
      return;
    }
    if (!values.consent) {
      setFieldError(t('careers.form.consentRequired'));
      return;
    }
    if (registrationRequired && !values.registration_number.trim()) {
      setFieldError(t('careers.form.registrationRequired'));
      return;
    }
    setPhase('sending');
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'consent') body.append(key, value ? 'true' : 'false');
      else if (key !== 'job_id') body.append(key, String(value));
    });
    if (values.job_id) body.append('job_id', values.job_id);
    body.append('website', honeypot);
    body.append('cv', file);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? ''}/api/v1/public/applications?lang=en`,
        { method: 'POST', body },
      );
      if (response.status === 429) {
        setPhase('rateLimited');
        return;
      }
      if (!response.ok) {
        setPhase('error');
        return;
      }
      setPhase('success');
    } catch {
      setPhase('error');
    }
  };
  if (phase === 'success')
    return (
      <section className={styles.success} aria-live="polite">
        <h3 ref={headingRef} tabIndex={-1}>
          {t('careers.form.successHeading')}
        </h3>
        <p>{t('careers.form.successText', { name: values.name })}</p>
        <p>{t('careers.form.retention')}</p>
      </section>
    );
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <Field
        kind="select"
        label={t('careers.form.job')}
        required
        requiredLabel={t('careers.form.required')}
        value={values.job_id}
        onChange={(event) => update('job_id', event.target.value)}
      >
        <option value="">{t('careers.form.generalInterest')}</option>
        {jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.title}
          </option>
        ))}
      </Field>
      <Field
        label={t('careers.form.name')}
        required
        requiredLabel={t('careers.form.required')}
        autoComplete="name"
        maxLength={100}
        value={values.name}
        onChange={(event) => update('name', event.target.value)}
      />
      <Field
        label={t('careers.form.phone')}
        required
        requiredLabel={t('careers.form.required')}
        type="tel"
        autoComplete="tel"
        maxLength={30}
        value={values.phone}
        onChange={(event) => update('phone', event.target.value)}
      />
      <Field
        label={t('careers.form.email')}
        required
        requiredLabel={t('careers.form.required')}
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => update('email', event.target.value)}
      />
      <Field
        label={t('careers.form.registration')}
        {...requiredProps(registrationRequired, t('careers.form.required'))}
        value={values.registration_number}
        onChange={(event) => update('registration_number', event.target.value)}
        maxLength={100}
      />
      <Field
        label={t('careers.form.qualification')}
        required
        requiredLabel={t('careers.form.required')}
        value={values.qualification}
        onChange={(event) => update('qualification', event.target.value)}
        maxLength={120}
      />
      <Field
        label={t('careers.form.experience')}
        required
        requiredLabel={t('careers.form.required')}
        type="number"
        min={0}
        max={50}
        step={1}
        value={values.experience_years}
        onChange={(event) => update('experience_years', event.target.value)}
      />
      <Field
        label={t('careers.form.area')}
        required
        requiredLabel={t('careers.form.required')}
        value={values.area}
        onChange={(event) => update('area', event.target.value)}
        maxLength={100}
      />
      <Field
        kind="textarea"
        label={t('careers.form.availability')}
        required
        requiredLabel={t('careers.form.required')}
        value={values.availability}
        onChange={(event) => update('availability', event.target.value)}
        maxLength={300}
        rows={3}
      />
      <Field
        label={t('careers.form.cv')}
        required
        requiredLabel={t('careers.form.required')}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <p className={styles.hint}>{t('careers.form.cvHint')}</p>
      <Field
        kind="textarea"
        label={t('careers.form.coverNote')}
        value={values.cover_note}
        onChange={(event) => update('cover_note', event.target.value)}
        maxLength={1000}
        rows={4}
      />
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          {t('careers.form.website')}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </label>
      </div>
      <Checkbox
        className={styles.consent}
        checked={values.consent}
        onChange={(event) => update('consent', event.target.checked)}
        required
        label={
          <>
            {t('careers.form.consent')} <a href="/privacy">{t('careers.form.privacy')}</a>
          </>
        }
      />
      {fieldError && (
        <p className={styles.error} role="alert">
          {fieldError}
        </p>
      )}
      {phase === 'rateLimited' && (
        <p className={styles.error} role="alert">
          {t('careers.form.rateLimited')}
        </p>
      )}
      {phase === 'error' && (
        <p className={styles.error} role="alert">
          {t('careers.form.failed')}
        </p>
      )}
      <Button type="submit" disabled={phase === 'sending'} aria-busy={phase === 'sending'}>
        {phase === 'sending' ? t('careers.form.sending') : t('careers.form.submit')}
      </Button>
    </form>
  );
}
