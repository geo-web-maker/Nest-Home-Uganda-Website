import { useState, type ReactNode } from 'react';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';
import styles from './AgreementsPage.module.css';

type LinkInfo = {
  state: 'live' | 'legacy' | 'none';
  link_id: string | null;
  generation: number;
  url: string | null;
  expires_at: string | null;
  earlier_links_still_valid: number;
};

type Props = {
  id: string;
  link?: LinkInfo;
  onChanged: () => void;
  resend?: ReactNode;
};

/** Manages secure client-link copying and explicit revocation/replacement. */
export function AgreementLinkPanel({ id, link, onChanged, resend }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    setBusy(true);
    setMessage('');
    try {
      const fresh = await apiClient.get<LinkInfo>(`/admin/agreements/${id}/link`);
      if (!fresh.url) throw new Error('No link is available yet.');
      await navigator.clipboard.writeText(fresh.url);
      setMessage(`Link copied (ID ${fresh.link_id}). Paste it into WhatsApp or anywhere else.`);
      onChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not copy the link.');
    } finally {
      setBusy(false);
    }
  };

  const replaceAll = async () => {
    const confirmed = await dialogs.confirm(
      'Withdraw ALL earlier links and create a brand-new one? Anyone using an old link will see "withdrawn". The new link is not sent automatically.',
      { confirmLabel: 'Withdraw and replace' },
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage('');
    try {
      const fresh = await apiClient.post<LinkInfo>(`/admin/agreements/${id}/link/revoke`, {});
      setMessage(`New link created (ID ${fresh.link_id}). Use Copy link or Resend link to give it to the client.`);
      onChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not replace the link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.linkPanel}>
      <h3>Client link</h3>
      <p>
        Link ID: <strong>{link?.link_id ?? 'none'}</strong>
        {link?.state === 'legacy' ? ' (older long link)' : ''}
        {link?.expires_at ? ` · expires ${new Date(link.expires_at).toLocaleDateString()}` : ''}
      </p>
      <p className={styles.linkHint}>
        If the client reports a problem, ask for the code on their screen. Its middle part should match this ID.
      </p>
      {message && <p role="status" className={styles.linkMsg}>{message}</p>}
      <div className={styles.linkActions}>
        <Button variant="outline" onClick={() => void copy()} disabled={busy}>Copy link</Button>
        {resend}
      </div>
      <div className={styles.linkActions}>
        <Button variant="danger-outline" onClick={() => void replaceAll()} disabled={busy}>
          Withdraw all links and create a new one
        </Button>
      </div>
    </div>
  );
}
