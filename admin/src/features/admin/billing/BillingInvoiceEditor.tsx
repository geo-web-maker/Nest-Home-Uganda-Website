import { useTranslation } from 'react-i18next';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { ServiceDateField } from './ServiceDateField';
import type { AgreementOption, EditorItem } from './billingTypes';
import styles from './BillingPage.module.css';

const PROGRAMS = [
  'Nest Mama Program',
  'Postnatal and newborn care',
  'Postoperative care',
  'Wound care',
  'Elderly nursing',
];

type Props = {
  billName: string;
  billEmail: string;
  billPhone: string;
  billAddress: string;
  careName: string;
  careProgram: string;
  agreementReference: string;
  agreements: AgreementOption[];
  agreementError: boolean;
  agreementNote: string;
  issueDate: string;
  dueDate: string;
  instructions: string;
  notes: string;
  isTest: boolean;
  items: EditorItem[];
  total: number;
  itemsInvalid: boolean;
  busy: boolean;
  onBillNameChange: (value: string) => void;
  onBillEmailChange: (value: string) => void;
  onBillPhoneChange: (value: string) => void;
  onBillAddressChange: (value: string) => void;
  onCareNameChange: (value: string) => void;
  onCareProgramChange: (value: string) => void;
  onChooseAgreement: (reference: string) => void;
  onIssueDateChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onPracticeChange: (checked: boolean) => void;
  onItemChange: (index: number, patch: Partial<EditorItem>) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

/** The invoice draft form. Business state and persistence remain in BillingPage. */
export function BillingInvoiceEditor({
  billName,
  billEmail,
  billPhone,
  billAddress,
  careName,
  careProgram,
  agreementReference,
  agreements,
  agreementError,
  agreementNote,
  issueDate,
  dueDate,
  instructions,
  notes,
  isTest,
  items,
  total,
  itemsInvalid,
  busy,
  onBillNameChange,
  onBillEmailChange,
  onBillPhoneChange,
  onBillAddressChange,
  onCareNameChange,
  onCareProgramChange,
  onChooseAgreement,
  onIssueDateChange,
  onDueDateChange,
  onInstructionsChange,
  onNotesChange,
  onPracticeChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSave,
  onCancel,
}: Props) {
  const { t } = useTranslation('admin');
  const formatMoney = (value: number) => `UGX ${value.toLocaleString('en-UG')}`;

  return (
    <div className={styles.panel}>
      <h2>{t('billing.editorTitle')}</h2>
      <div className={styles.formGrid}>
        <Field label={t('billing.clientName')} value={billName} onChange={(event) => onBillNameChange(event.target.value)} />
        <Field label={t('billing.clientEmail')} value={billEmail} onChange={(event) => onBillEmailChange(event.target.value)} />
        <Field label={t('billing.clientPhone')} value={billPhone} onChange={(event) => onBillPhoneChange(event.target.value)} />
        <Field label={t('billing.clientAddress')} value={billAddress} onChange={(event) => onBillAddressChange(event.target.value)} />
        <Field label={t('billing.careRecipient')} value={careName} onChange={(event) => onCareNameChange(event.target.value)} />
        <Field
          label={t('billing.careProgram')}
          value={careProgram}
          list="care-programs"
          onChange={(event) => onCareProgramChange(event.target.value)}
        />
        <datalist id="care-programs">
          {PROGRAMS.map((name) => <option key={name} value={name} />)}
        </datalist>
        <Field
          kind="select"
          label={t('billing.agreementReference')}
          value={agreementReference}
          onChange={(event) => onChooseAgreement(event.target.value)}
        >
          <option value="">{t('billing.agreementNone')}</option>
          {agreementReference && !agreements.some((entry) => entry.reference === agreementReference) ? (
            <option value={agreementReference}>{agreementReference}</option>
          ) : null}
          {agreements.map((entry) => (
            <option key={entry.reference} value={entry.reference}>
              {t('billing.agreementOption', {
                reference: entry.reference,
                client: entry.client_name || '-',
                status: entry.status.replace(/_/g, ' '),
              })}
            </option>
          ))}
        </Field>
        <Field label={t('billing.issueDate')} type="date" value={issueDate} onChange={(event) => onIssueDateChange(event.target.value)} />
        <Field label={t('billing.dueDate')} type="date" value={dueDate} onChange={(event) => onDueDateChange(event.target.value)} />
        <Field label={t('billing.paymentInstructions')} value={instructions} onChange={(event) => onInstructionsChange(event.target.value)} />
        <Field label={t('billing.notes')} value={notes} onChange={(event) => onNotesChange(event.target.value)} />
      </div>

      {agreementError ? <p className={styles.muted}>{t('billing.agreementLoadError')}</p> : null}
      {agreementNote ? (
        <p className={styles.muted} role="status">
          {agreementNote} {t('billing.agreementHelp')}
        </p>
      ) : null}
      <Checkbox
        className={styles.practiceFilter}
        checked={isTest}
        onChange={(event) => onPracticeChange(event.target.checked)}
        label={t('billing.practiceDocument')}
      />

      <h3>{t('billing.items')}</h3>
      {items.map((item, index) => (
        <div className={styles.itemRow} key={index}>
          <Field
            label={t('billing.description')}
            value={item.description}
            onChange={(event) => onItemChange(index, { description: event.target.value })}
          />
          <ServiceDateField
            value={item.service}
            onChange={(service) => onItemChange(index, { service })}
          />
          <Field
            label={t('billing.quantity')}
            type="number"
            min={1}
            max={10000}
            value={String(item.quantity)}
            onChange={(event) => onItemChange(index, { quantity: Number(event.target.value) })}
          />
          <Field
            label={t('billing.unitPrice')}
            type="number"
            min={0}
            max={2000000000}
            value={String(item.unit_price_ugx)}
            onChange={(event) => onItemChange(index, { unit_price_ugx: Number(event.target.value) })}
          />
          <Button variant="outline" onClick={() => onRemoveItem(index)}>
            {t('billing.remove')}
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={onAddItem} disabled={items.length >= 60}>
        {t('billing.addItem')}
      </Button>
      <p className={styles.total}>
        {t('billing.total')}: {formatMoney(total)}
      </p>
      <div className={styles.actions}>
        <Button onClick={onSave} disabled={busy || !billName.trim() || dueDate < issueDate || itemsInvalid}>
          {t('billing.saveDraft')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('billing.cancel')}
        </Button>
      </div>
    </div>
  );
}
