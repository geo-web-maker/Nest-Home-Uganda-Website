import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { AgreementFieldInput } from '../../agreements/AgreementFieldInput';
import { SCHEDULE_SECTIONS, fieldMeta, isHiddenField } from '../../agreements/fieldMeta';
import type { Assistance, PublicAgreement, SaveState } from './AgreementPublicParts';
import { SaveStatus, toText } from './AgreementPublicParts';
import styles from './AgreementPublicPage.module.css';

type Props = {
  agreement: PublicAgreement;
  assistance: Assistance['state'];
  hasClientFields: boolean;
  drafts: Record<string, string>;
  saveState: Record<string, SaveState>;
  assistOpen: boolean;
  assistNote: string;
  busy: boolean;
  onDraftChange: (path: string, value: string) => void;
  onCommit: (path: string, value: string) => void;
  onRetrySave: () => void;
  onOpenAssistance: () => void;
  onAssistNoteChange: (value: string) => void;
  onRequestAssistance: () => void;
  onCloseAssistance: () => void;
};

/** Groups client-editable fields by their agreement schedule and keeps save feedback beside each field. */
export function ClientAgreementFields({
  agreement,
  assistance,
  hasClientFields,
  drafts,
  saveState,
  assistOpen,
  assistNote,
  busy,
  onDraftChange,
  onCommit,
  onRetrySave,
  onOpenAssistance,
  onAssistNoteChange,
  onRequestAssistance,
  onCloseAssistance,
}: Props) {
  const groups = (['parties', 'schedule_a', 'schedule_b', 'schedule_c'] as const).flatMap((tabId) =>
    SCHEDULE_SECTIONS[tabId].sections.map((section) => ({
      ...section,
      group: SCHEDULE_SECTIONS[tabId].title,
    })),
  );
  const known = new Set(groups.flatMap((section) => section.paths));
  const leftovers = Object.keys(agreement.fields).filter((path) => !known.has(path) && !isHiddenField(path));
  const all = leftovers.length
    ? [...groups, { id: 'other', group: 'Other', title: 'Other details', paths: leftovers }]
    : groups;
  const currentValue = (path: string): string => drafts[path] ?? toText(agreement.fields[path]?.value);
  const currency = toText(drafts['schedule_b.currency'] ?? agreement.fields['schedule_b.currency']?.value) || 'UGX';
  let lastGroup = '';

  const rendered = all.map((section) => {
    // Staff and clinical fields are already included in the agreement document above.
    const paths = section.paths.filter((path) => {
      const field = agreement.fields[path];
      return field
        && ['client', 'either'].includes(field.owner)
        && (fieldMeta(path).showWhen?.(currentValue) ?? true);
    });
    if (!paths.length) return null;

    const heading = section.group !== lastGroup
      ? <h3 className={styles.groupHeading}>{section.group}</h3>
      : null;
    lastGroup = section.group;

    return (
      <div key={section.id}>
        {heading}
        <fieldset className={styles.fieldGroup}>
          <legend>{section.title}</legend>
          {paths.map((path) => {
            const field = agreement.fields[path];
            if (!field) return null;
            const editable = field.owner === 'client' || field.owner === 'either';
            const meta = fieldMeta(path);
            const value = currentValue(path);
            const dirty = value !== toText(field.value);

            return (
              <div className={styles.formField} key={path}>
                <label htmlFor={`client-${path}`}>
                  <span>
                    {meta.label}
                    {meta.required && <abbr title="Required"> *</abbr>}
                  </span>
                  <small>
                    {editable
                      ? <SaveStatus state={saveState[path]} dirty={dirty} onRetry={onRetrySave} />
                      : 'Completed by Bloomwell'}
                  </small>
                </label>
                {meta.help && <small>{meta.help}</small>}
                <AgreementFieldInput
                  path={path}
                  id={`client-${path}`}
                  value={value}
                  readOnly={!editable}
                  currency={currency}
                  onChange={(next) => onDraftChange(path, next)}
                  onCommit={(next) => onCommit(path, next)}
                />
                {field.entered_by_staff && (
                  <small>Entered by a Bloomwell staff member on your behalf; please check it carefully.</small>
                )}
              </div>
            );
          })}
        </fieldset>
      </div>
    );
  });

  return (
    <>
      {assistance === 'ready' && (
        <div className={styles.notice}>
          <strong>Bloomwell filled in your details at your request.</strong> Please check each one and change anything that is not right. Consent items are always yours to answer.
        </div>
      )}
      <p>
        {assistance === 'ready'
          ? 'Check the details below. Everything else in the agreement has been completed by Bloomwell and is shown in the document.'
          : 'Please complete the details below. Everything else in the agreement has been completed by Bloomwell and is shown in the document.'}
      </p>
      {rendered.some(Boolean)
        ? rendered
        : <p className={styles.notice}>There is nothing for you to fill in. Please read the agreement, then sign below.</p>}

      {hasClientFields && assistance === 'none' && (
        <button type="button" className={styles.linkButton} onClick={onOpenAssistance} disabled={busy}>
          Prefer Bloomwell fills this in for me
        </button>
      )}
      {assistOpen && (
        <div className={styles.assist}>
          <p><strong>Ask Bloomwell to fill in your details.</strong> Anything you have already entered is kept. You still sign it yourself.</p>
          <Field
            kind="textarea"
            label="Anything we should know? (optional)"
            value={assistNote}
            maxLength={500}
            rows={3}
            onChange={(event) => onAssistNoteChange(event.target.value)}
          />
          <div className={styles.actionRow}>
            <Button onClick={onRequestAssistance} disabled={busy} aria-busy={busy || undefined}>
              Send my request
            </Button>
            <Button variant="outline" onClick={onCloseAssistance} disabled={busy}>
              Back
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
