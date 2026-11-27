import { DateCalculator, type CalcDateField } from '@shared/features/agreements/DateCalculator';
import {
  SCHEDULE_SECTIONS,
  fieldMeta,
  fieldLabel,
  isBlank,
  isHiddenField,
  notInFormNote,
  type FieldSection,
  type ScheduleTab,
  paymentOptionKind,
} from '@shared/features/agreements/fieldMeta';
import { AgreementFieldEditor } from './AgreementFieldEditor';
import type { AgreementField, FieldConflict } from './agreementFieldTypes';
import styles from './AgreementsPage.module.css';

type ScheduleDetail = {
  status: string;
  fields: Record<string, AgreementField>;
  schedule_b_computed?: Record<string, string | number>;
  assistance?: { state: 'none' | 'requested' | 'ready' };
};

type Props = {
  detail: ScheduleDetail;
  tab: ScheduleTab;
  displayedFields: Array<[string, AgreementField]>;
  drafts: Record<string, string>;
  conflicts: Record<string, FieldConflict>;
  enteredStaff: Record<string, boolean>;
  canWrite: boolean;
  busy: boolean;
  onDraftChange: (path: string, value: string) => void;
  onSaveField: (path: string, override?: { value: string; revision: number }) => void;
  onEnteredByStaffChange: (path: string, checked: boolean) => void;
  onClearConflict: (path: string) => void;
};

const LOCKED_STATUSES = new Set(['voided', 'expired', 'client_signed', 'completed']);

/** Renders one agreement schedule, including field ownership, date helpers and fee calculations. */
export function AgreementSchedulePanel({
  detail,
  tab,
  displayedFields,
  drafts,
  conflicts,
  enteredStaff,
  canWrite,
  busy,
  onDraftChange,
  onSaveField,
  onEnteredByStaffChange,
  onClearConflict,
}: Props) {
  const config = SCHEDULE_SECTIONS[tab];
  const known = new Set(config.sections.flatMap((section) => section.paths));
  const leftovers = displayedFields
    .map(([path]) => path)
    .filter((path) => !known.has(path) && !isHiddenField(path));
  const sections: FieldSection[] = leftovers.length
    ? [...config.sections, { id: 'other', title: 'Other fields', paths: leftovers }]
    : config.sections;
  const currencyField = detail.fields['schedule_b.currency'];
  const currency = (drafts['schedule_b.currency'] ?? valueText(currencyField?.value)) || 'UGX';
  const needed = outstanding(detail.fields, sections.flatMap((section) => section.paths));
  const dateLocked = LOCKED_STATUSES.has(detail.status);
  const calcDateFields: CalcDateField[] = Object.entries(detail.fields)
    .filter(([path]) => fieldMeta(path).kind === 'date' && !isHiddenField(path))
    .map(([path, field]) => ({
      path,
      label: fieldLabel(path),
      value: drafts[path] ?? valueText(field.value),
      writable: canWrite && !dateLocked && field.owner !== 'client',
    }));
  const computed = detail.schedule_b_computed ?? {};
  const money = (key: string) => typeof computed[key] === 'number'
    ? Number(computed[key]).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—';

  const renderField = (path: string) => {
    const field = detail.fields[path];
    if (!field) return null;
    const meta = fieldMeta(path);
    if (meta.showWhen && !meta.showWhen((other) => drafts[other] ?? valueText(detail.fields[other]?.value))) {
      return null;
    }
    const local = drafts[path] ?? valueText(field.value);
    const readOnly = !canWrite || dateLocked || field.owner === 'client';
    const conflict = conflicts[path];
    const blank = isBlank(field.value);
    const staffNeeds = blank && path !== 'schedule_b.payment_option'
      && (field.owner === 'staff' || field.owner === 'clinical');
    return (
      <AgreementFieldEditor
        key={path}
        path={path}
        field={field}
        meta={meta}
        value={local}
        currency={currency}
        readOnly={readOnly}
        busy={busy}
        blank={blank}
        changed={local !== valueText(field.value)}
        staffNeeds={staffNeeds}
        skipNote={notInFormNote(path, field.owner) ?? ''}
        enteredByStaff={enteredStaff[path] ?? (detail.assistance?.state === 'requested' || field.entered_by_staff)}
        conflict={conflict}
        onChange={(value) => onDraftChange(path, value)}
        onSave={() => onSaveField(path)}
        onEnteredByStaffChange={(checked) => onEnteredByStaffChange(path, checked)}
        onKeepMine={() => {
          if (conflict) onSaveField(path, { value: conflict.local, revision: conflict.revision });
        }}
        onUseSaved={() => {
          if (!conflict) return;
          onDraftChange(path, conflict.remote);
          onClearConflict(path);
        }}
      />
    );
  };

  return (
    <div className={styles.schedule}>
      <div className={styles.guide}>
        <h3>{config.title}</h3>
        <p>{config.intro}</p>
        {(needed.length > 0 || tab === 'schedule_a' || tab === 'schedule_b') && (
          <p className={needed.length ? styles.guideNeeded : styles.guideDone}>
            {needed.length
              ? `${needed.length} staff field${needed.length === 1 ? '' : 's'} still to complete or mark N/A before sending.`
              : '✓ Everything staff need to enter here is complete.'}
          </p>
        )}
      </div>
      {(tab === 'schedule_a' || tab === 'schedule_b') && (
        <DateCalculator
          busy={busy}
          fields={calcDateFields}
          onUse={(path, iso) => {
            const current = detail.fields[path];
            if (current) onSaveField(path, { value: iso, revision: current.revision });
          }}
        />
      )}
      {sections.map((section) => {
        const paths = section.paths.filter((path) => detail.fields[path]);
        if (!paths.length) return null;
        const done = paths.filter((path) => !isBlank(detail.fields[path]?.value)).length;
        return (
          <section className={styles.sectionCard} key={section.id} aria-label={section.title}>
            <header className={styles.sectionHead}>
              <h4>{section.title}</h4>
              <span className={styles.count}>{done} of {paths.length} filled</span>
            </header>
            {section.hint && <p className={styles.fieldHelp}>{section.hint}</p>}
            <div className={styles.fields}>{paths.map(renderField)}</div>
          </section>
        );
      })}
      {tab === 'schedule_b' && (
        <div className={styles.feeBox}>
          <strong>Live fee calculation</strong>
          <dl className={styles.feeTable}>
            <div><dt>Booking fee (non-refundable, additional)</dt><dd>UGX {money('booking_fee')}</dd></div>
            <div><dt>Total service fees</dt><dd>{String(computed.currency ?? currency)} {money('total_service_fees')}</dd></div>
            <div><dt>Advance (50%)</dt><dd>{String(computed.currency ?? currency)} {money('advance')}</dd></div>
            <div><dt>Balance (50%)</dt><dd>{String(computed.currency ?? currency)} {money('balance')}</dd></div>
            {computed.total_payable_if_ugx !== null && computed.total_payable_if_ugx !== undefined && (
              <div className={styles.feeTotal}>
                <dt>Total payable (UGX)</dt>
                <dd>UGX {money('total_payable_if_ugx')}</dd>
              </div>
            )}
          </dl>
          <small>
            Updates when you save the currency or total fee. The UGX 50,000 booking fee is additional to the service fees
            and excluded from the 50/50 split (clauses 8.2 and 8.4). USD fees stay separate; no exchange rate is assumed.
          </small>
        </div>
      )}
    </div>
  );
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function outstanding(fields: Record<string, AgreementField>, paths: string[]): string[] {
  return paths.filter((path) => {
    const field = fields[path];
    if (path === 'schedule_b.payment_option') return false;
    if (path === 'schedule_b.payment_plan_details'
      && paymentOptionKind(valueText(fields['schedule_b.payment_option']?.value)) === 'standard') return false;
    if ((path === 'schedule_b.advance_due_date' || path === 'schedule_b.balance_due_dates')
      && paymentOptionKind(valueText(fields['schedule_b.payment_option']?.value)) !== 'standard') return false;
    return field !== undefined
      && (field.owner === 'staff' || field.owner === 'clinical')
      && isBlank(field.value);
  });
}
