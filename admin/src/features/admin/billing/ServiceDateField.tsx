import { useTranslation } from 'react-i18next';
import { Field } from '@shared/components/ui/Field';
import { serviceProblem, type ServiceMode, type ServiceValue } from './serviceDate';
import styles from './BillingPage.module.css';

type Props = { value: ServiceValue; onChange: (next: ServiceValue) => void };

/** Pick whether an item was for one date or a period, then pick the date or the two dates. */
export function ServiceDateField({ value, onChange }: Props) {
  const { t } = useTranslation('admin');
  const problem = serviceProblem(value);
  const error =
    problem === 'order'
      ? t('billing.serviceDateOrder')
      : problem === 'incomplete'
        ? t('billing.serviceDateIncomplete')
        : undefined;
  const set = (patch: Partial<ServiceValue>) => onChange({ ...value, ...patch });
  return (
    <div className={styles.serviceCell}>
      <Field
        kind="select"
        label={t('billing.serviceDateType')}
        value={value.mode}
        onChange={(event) => {
          const mode = event.target.value as ServiceMode;
          // Keep the first date when switching between a date and a period, so nothing typed is lost.
          set({ mode, end: mode === 'period' ? value.end : '' });
        }}
      >
        <option value="none">{t('billing.serviceNone')}</option>
        <option value="date">{t('billing.serviceSingle')}</option>
        <option value="period">{t('billing.servicePeriod')}</option>
      </Field>
      {value.mode === 'date' ? (
        <Field
          type="date"
          label={t('billing.serviceDate')}
          value={value.start}
          onChange={(event) => set({ start: event.target.value })}
        />
      ) : null}
      {value.mode === 'period' ? (
        <div className={styles.serviceDates}>
          <Field
            type="date"
            label={t('billing.serviceFrom')}
            value={value.start}
            error={error}
            onChange={(event) => set({ start: event.target.value })}
          />
          <Field
            type="date"
            label={t('billing.serviceTo')}
            value={value.end}
            min={value.start || undefined}
            onChange={(event) => set({ end: event.target.value })}
          />
        </div>
      ) : null}
      {value.mode === 'none' && value.legacy ? (
        <p className={styles.muted}>{t('billing.serviceLegacy', { text: value.legacy })}</p>
      ) : null}
    </div>
  );
}
