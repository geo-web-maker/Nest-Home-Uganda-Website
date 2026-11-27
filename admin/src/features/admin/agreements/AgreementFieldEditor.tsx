import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { AgreementFieldInput } from '@shared/features/agreements/AgreementFieldInput';
import { OWNER_LABEL, type FieldMeta } from '@shared/features/agreements/fieldMeta';
import type { AgreementField, FieldConflict } from './agreementFieldTypes';
import styles from './AgreementsPage.module.css';

type Props = {
  path: string;
  field: AgreementField;
  meta: FieldMeta;
  value: string;
  currency: string;
  readOnly: boolean;
  busy: boolean;
  blank: boolean;
  changed: boolean;
  staffNeeds: boolean;
  skipNote: string;
  enteredByStaff: boolean;
  conflict?: FieldConflict;
  onChange: (value: string) => void;
  onSave: () => void;
  onEnteredByStaffChange: (checked: boolean) => void;
  onKeepMine: () => void;
  onUseSaved: () => void;
};

/** A single agreement field, including ownership, save state and revision-conflict actions. */
export function AgreementFieldEditor({
  path,
  field,
  meta,
  value,
  currency,
  readOnly,
  busy,
  blank,
  changed,
  staffNeeds,
  skipNote,
  enteredByStaff,
  conflict,
  onChange,
  onSave,
  onEnteredByStaffChange,
  onKeepMine,
  onUseSaved,
}: Props) {
  return (
    <div
      className={`${styles.field} ${meta.kind === 'long' ? styles.wide : ''} ${staffNeeds ? styles.fieldNeeded : !blank ? styles.fieldDone : ''}`}
      key={path}
    >
      <label htmlFor={`agreement-${path}`}>
        <span>
          {meta.label}
          {meta.required && <abbr title="Required before sending" className={styles.req}> *</abbr>}
        </span>
        <span className={`${styles.pill} ${styles[`owner_${field.owner}`]}`}>
          {OWNER_LABEL[field.owner] ?? field.owner}
        </span>
      </label>
      {skipNote && (
        <p className={styles.notInForm}>
          <strong>Not in the agreement form.</strong> {skipNote}
        </p>
      )}
      {meta.help && <p className={styles.fieldHelp}>{meta.help}</p>}
      <AgreementFieldInput
        path={path}
        id={`agreement-${path}`}
        value={value}
        readOnly={readOnly}
        currency={currency}
        allowNA={field.owner !== 'client'}
        onChange={onChange}
      />
      <div className={styles.fieldFoot}>
        <span className={blank ? (staffNeeds ? styles.statusNeeded : styles.statusWaiting) : styles.statusDone}>
          {!blank
            ? '✓ Saved'
            : staffNeeds
              ? (skipNote ? 'Fill or mark N/A to skip' : 'Needed before sending')
              : field.owner === 'client'
                ? 'Waiting for client'
                : 'Optional'}
          {field.entered_by_staff ? ' · entered by staff' : ''}
          {field.updated_at
            ? ` · last edited ${new Date(field.updated_at).toLocaleString()}${field.updated_by && field.updated_by !== 'client' ? ` by staff ${field.updated_by.slice(-4)}` : field.updated_by === 'client' ? ' by client' : ''}`
            : ''}
        </span>
        {!readOnly && (
          <Button size="compact" variant="outline" onClick={onSave} disabled={busy || !changed}>
            Save
          </Button>
        )}
      </div>
      {field.owner === 'either' && !readOnly && (
        <Checkbox
          label="Entered by staff on client's behalf"
          checked={enteredByStaff}
          onChange={(event) => onEnteredByStaffChange(event.target.checked)}
        />
      )}
      {conflict && (
        <div className={styles.conflict}>
          <p>
            <strong>Another saver updated this field.</strong>
            <br />Current saved value: {conflict.remote || '—'}
            <br />Your unsaved value: {conflict.local || '—'}
          </p>
          <Button size="compact" onClick={onKeepMine} disabled={busy}>
            Keep my value
          </Button>
          <Button size="compact" variant="outline" onClick={onUseSaved}>
            Use saved value
          </Button>
        </div>
      )}
    </div>
  );
}
