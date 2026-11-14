import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { apiClient, ApiError } from '@shared/lib/api/client';
import styles from './MailPage.module.css';

type Result = {
  sent: boolean;
  provider?: string;
  provider_message_id?: string | null;
  recipient?: string;
  subject?: string;
  attachment_included?: boolean;
  attachment_filename?: string | null;
  attachment_size_bytes?: number;
  message?: string;
};

/** Sends one administrator-requested external test through the selected provider. */
export function MailOutboundTest() {
  const [recipient, setRecipient] = useState('');
  const [includeAttachment, setIncludeAttachment] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  const send = useMutation({
    mutationFn: () => apiClient.post<Result>('/mail/settings/test-send', {
      to: recipient.trim(),
      include_attachment: includeAttachment,
    }),
    onMutate: () => { setResult(null); setError(''); },
    onSuccess: setResult,
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'The provider test could not be submitted.');
    },
  });

  return (
    <section className={styles.panel} aria-label="External sending test">
      <SectionHeader title="External sending and attachment test" />
      <Field type="email" label="External test recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} autoComplete="email" />
      <Checkbox label="Include the small diagnostics attachment" checked={includeAttachment} onChange={(event) => setIncludeAttachment(event.target.checked)} />
      <Button disabled={!validEmail || send.isPending} onClick={() => send.mutate()}>
        {send.isPending ? 'Submitting test…' : 'Send external test'}
      </Button>
      {error ? <Notice tone="error" floating onDismiss={() => setError('')}>{error}</Notice> : null}
      {result ? (
        <Notice tone={result.sent ? 'success' : 'info'}>
          {result.message || (result.sent ? `Accepted by ${result.provider || 'the provider'}. Check ${result.recipient || recipient}, including spam.` : 'No external message was sent.')}
          {result.sent && result.attachment_included ? ` Attachment included: ${result.attachment_filename} (${result.attachment_size_bytes} bytes).` : ''}
          {result.provider_message_id ? ` Provider message ID: ${result.provider_message_id}.` : ''}
        </Notice>
      ) : null}
    </section>
  );
}
