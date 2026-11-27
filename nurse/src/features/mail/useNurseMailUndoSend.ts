import { useCallback, useEffect, useRef, useState } from 'react';
import { putDraft, type MailDraft } from './mailStore';
import type { ComposeState } from './MailComposeSheet';

type PendingUndo = { record: MailDraft; snapshot: ComposeState };

/** Owns the short undo window between saving a message and adding it to the send queue. */
export function useNurseMailUndoSend(releaseSend: (record: MailDraft) => Promise<void>) {
  const [undo, setUndo] = useState<PendingUndo | null>(null);
  const undoRef = useRef<PendingUndo | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const flushUndo = useCallback(() => {
    window.clearTimeout(undoTimer.current);
    const item = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    if (item) void releaseSend(item.record);
  }, [releaseSend]);

  const startUndoWindow = useCallback((record: MailDraft, snapshot: ComposeState) => {
    window.clearTimeout(undoTimer.current);
    if (undoRef.current) void releaseSend(undoRef.current.record);
    const pending = { record, snapshot };
    undoRef.current = pending;
    setUndo(pending);
    undoTimer.current = window.setTimeout(flushUndo, 8000);
  }, [flushUndo, releaseSend]);

  const undoSend = useCallback(() => {
    window.clearTimeout(undoTimer.current);
    const item = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    return item?.snapshot ?? null;
  }, []);

  // Leaving the screen inside the window queues the message rather than losing it.
  useEffect(() => () => {
    window.clearTimeout(undoTimer.current);
    const item = undoRef.current;
    undoRef.current = null;
    if (item) void putDraft({ ...item.record, state: 'queued' });
  }, []);

  return { undo, startUndoWindow, flushUndo, undoSend };
}
