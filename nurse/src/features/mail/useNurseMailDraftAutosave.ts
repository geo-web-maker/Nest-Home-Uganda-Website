import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { copy } from '../../copy';
import { parseAddresses } from './mailAddresses';
import { putDraft } from './mailStore';
import type { ComposeState } from './MailComposeSheet';

/** Persists an in-progress composer locally after the existing 750ms idle delay. */
export function useNurseMailDraftAutosave(
  composer: ComposeState | null,
  ownerId: string,
  reloadDrafts: () => Promise<void>,
  setProblem: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!composer || !ownerId) return;
    const handle = window.setTimeout(() => {
      void putDraft({
        id: composer.id,
        ownerId,
        mailboxId: composer.mailboxId,
        to: parseAddresses(composer.to),
        cc: parseAddresses(composer.cc),
        bcc: parseAddresses(composer.bcc),
        subject: composer.subject,
        body: composer.body,
        bodyHtml: composer.bodyHtml,
        bodyFormat: composer.bodyFormat ?? 'plain',
        quotedHtml: composer.quotedHtml,
        removeQuote: composer.removeQuote,
        inReplyTo: composer.inReplyTo,
        quote: composer.quote,
        serverDraftId: composer.serverDraftId,
        attachments: composer.attachments,
        state: 'draft',
        savedAt: new Date().toISOString(),
      }).then(reloadDrafts).catch(() => setProblem(copy.mail.draftStoreError));
    }, 750);
    return () => window.clearTimeout(handle);
  }, [composer, ownerId, reloadDrafts, setProblem]);
}
