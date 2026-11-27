import { Field } from '../../../components/ui/Field';
import styles from './ApplicationForm.module.css';

type ApplicationUploadFieldsProps = {
  label: string;
  requiredLabel: string;
  hint: string;
  onFileChange: (file: File | null) => void;
};

/** CV selection and accepted-format guidance kept together for the application form. */
export function ApplicationUploadFields({
  label,
  requiredLabel,
  hint,
  onFileChange,
}: ApplicationUploadFieldsProps) {
  return (
    <>
      <Field
        label={label}
        required
        requiredLabel={requiredLabel}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <p className={styles.hint}>{hint}</p>
    </>
  );
}

type ApplicationHoneypotProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/** Hidden anti-bot field; intentionally excluded from normal keyboard navigation. */
export function ApplicationHoneypot({ label, value, onChange }: ApplicationHoneypotProps) {
  return (
    <div className={styles.honeypot} aria-hidden="true">
      <label>
        {label}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
