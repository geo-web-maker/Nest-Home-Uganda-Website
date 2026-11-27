import { fieldLabel as metaLabel } from '../../agreements/fieldMeta';
import styles from './AgreementPublicPage.module.css';

export type AgreementField = {
  value: unknown;
  owner: 'staff' | 'clinical' | 'client' | 'either';
  revision: number;
  entered_by_staff: boolean;
};

export type Assistance = {
  state: 'none' | 'requested' | 'ready';
  requested_at?: string | null;
  ready_at?: string | null;
};

export type PublicAgreement = {
  is_test?: boolean;
  company: string;
  reference: string;
  status: string;
  template_version: number;
  clauses: Record<string, string>;
  document_html?: string | null;
  fields: Record<string, AgreementField>;
  schedule_b_computed: Record<string, string | number>;
  content_hash: string;
  signed: boolean;
  variation_clause?: string | null;
  parent_reference?: string | null;
  /** How the client chose to fill the form in, and where a request for help stands. Absent on older servers. */
  fill_mode?: 'self' | 'assisted' | null;
  assistance?: Assistance;
  signatures?: Array<{ role: string; name: string; method: string; signed_at: string }>;
  certificate?: PublicCertificate | null;
  pdf_available?: boolean;
};

export type PublicCertificate = {
  practice?: boolean;
  reference?: string | null;
  client?: string | null;
  patient?: string | null;
  client_signed_at?: string | null;
  countersigned_at?: string | null;
  sealed_at?: string | null;
  content_hash?: string | null;
  signers: Array<{
    role: string;
    name: string;
    method: string;
    signed_at: string;
    code_verified_at?: string | null;
  }>;
};

export type PreOtp = {
  link_id?: string;
  release?: string;
  company: string;
  message: string;
  phone_hint?: string | null;
  email_hint?: string | null;
  available_channels: { sms: boolean; email: boolean };
  purpose: 'sign' | 'view';
};

export type OtpSent = {
  message: string;
  destination_hint: string;
  channel?: 'sms' | 'email';
  resend_after?: number;
  expires_in?: number;
};

export type SaveState = 'saving' | 'saved' | 'error';

export type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const RESEND_FALLBACK_SECONDS = 60;
export const PHONE = '0787499988';

// Keep identical to ESIGN_CONSENT_TEXT in the backend agreements service (the server stores its own copy).
export const ESIGN_CONSENT_TEXT =
  'I agree to sign this agreement electronically. I understand that my electronic signature has the same effect as a handwritten signature.';

export const when = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

export const clock = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

export function fieldLabel(path: string): string {
  return metaLabel(path);
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Per-field save indicator shown beside each field the client can edit. */
export function SaveStatus({
  state,
  dirty,
  onRetry,
}: {
  state?: SaveState;
  dirty: boolean;
  onRetry: () => void;
}) {
  const shown = state ?? (dirty ? 'unsaved' : 'idle');
  return (
    <span className={styles.saveState} data-state={shown} aria-live="polite">
      {shown === 'saving' && 'Saving…'}
      {shown === 'saved' && '✓ Saved'}
      {shown === 'unsaved' && 'Unsaved changes'}
      {shown === 'error' && (
        <>
          Not saved. <button type="button" onClick={onRetry}>Retry</button>
        </>
      )}
      {shown === 'idle' && 'Your field'}
    </span>
  );
}

const iconProps = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M14 10V6.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 13.5V11a1.5 1.5 0 0 1 3 0" />
    </svg>
  );
}

/** Stepper above the card title: verify, details, then review and sign. */
export function Steps({ current }: { current: 0 | 1 | 2 | 3 }) {
  const items = ['Verify it is you', 'Your details', 'Review and sign'];
  return (
    <ol className={styles.stepper} aria-label="Progress">
      {items.map((label, index) => (
        <li
          key={label}
          data-state={index < current ? 'done' : undefined}
          aria-current={index === current ? 'step' : undefined}
        >
          <span aria-hidden="true">{index < current ? '✓' : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
