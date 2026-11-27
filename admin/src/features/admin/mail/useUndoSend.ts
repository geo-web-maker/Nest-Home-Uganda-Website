import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { apiClient } from '@shared/lib/api/client';
import type { ComposeSeed } from './types';

const UNDO_SEND_MS = 8000;

export type PendingSend = { draftId: string; mailboxId: string; seed: ComposeSeed };
type MailNotice = { tone: 'success' | 'error'; text: string };

type UseUndoSendOptions = {
  setSeed: Dispatch<SetStateAction<ComposeSeed | null>>;
  setNotice: Dispatch<SetStateAction<MailNotice | null>>;
  refreshAll: () => Promise<unknown>;
  sentMessage: string;
  sendErrorMessage: string;
};

/** Owns the delayed-send window, undo action and page-exit flush for admin mail. */
export function useUndoSend({
  setSeed,
  setNotice,
  refreshAll,
  sentMessage,
  sendErrorMessage,
}: UseUndoSendOptions) {
  const [pending, setPending] = useState<PendingSend | null>(null);
  const pendingRef = useRef<PendingSend | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const dispatchSend = useCallback(async (item: PendingSend) => {
    try {
      // Sending is idempotent on the server (a draft already sent answers "already_sent"),
      // so a dropped connection is retried instead of failing a message that may have gone through.
      let attempt = 0;
      for (;;) {
        try {
          await apiClient.post(`/mail/drafts/${item.draftId}/send`, { mailbox_id: item.mailboxId });
          break;
        } catch (failure) {
          const dropped = failure instanceof Error && 'status' in failure && (failure as { status?: number }).status === 0;
          if (!dropped || attempt >= 2) throw failure;
          attempt += 1;
          await new Promise((resolve) => window.setTimeout(resolve, 1500 * attempt));
        }
      }
      setNotice({ tone: 'success', text: sentMessage });
      void refreshAll();
    } catch (cause) {
      // The message stays in Drafts; the reason is shown on the page (the composer is closed).
      const dropped = cause instanceof Error && (cause as { status?: number }).status === 0;
      const reason = dropped
        ? 'The server did not answer the send request, so the message may not have been sent.'
        : cause instanceof Error && cause.message
          ? cause.message
          : sendErrorMessage;
      setNotice({ tone: 'error', text: `${reason} Your message is saved in Drafts.` });
      void refreshAll();
    }
  }, [refreshAll, sendErrorMessage, sentMessage, setNotice]);

  const flushPending = useCallback(() => {
    window.clearTimeout(timer.current);
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (item) void dispatchSend(item);
  }, [dispatchSend]);

  const startSend = useCallback((item: PendingSend) => {
    window.clearTimeout(timer.current);
    if (pendingRef.current) void dispatchSend(pendingRef.current);
    pendingRef.current = item;
    setSeed(null);
    setNotice(null);
    setPending(item);
    timer.current = window.setTimeout(flushPending, UNDO_SEND_MS);
  }, [dispatchSend, flushPending, setNotice, setSeed]);

  const undoSend = useCallback(() => {
    window.clearTimeout(timer.current);
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (item) setSeed(item.seed);
  }, [setSeed]);

  // Leaving the page or closing the tab inside the window sends the message instead of stranding it.
  const leave = useCallback(() => {
    const item = pendingRef.current;
    if (item) {
      pendingRef.current = null;
      void apiClient.post(`/mail/drafts/${item.draftId}/send`, { mailbox_id: item.mailboxId });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.clearTimeout(timer.current);
      leave();
    };
  }, [leave]);

  return { pending, startSend, undoSend, flushPending };
}
