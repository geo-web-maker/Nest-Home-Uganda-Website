import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiClient } from '../../../lib/api/client';
import { fieldLabel, toText, type PublicAgreement, type SaveState } from './AgreementPublicParts';

type DraftChange = {
  path: string;
  value: string;
  expected_revision: number;
  entered_by_staff: false;
};

type DraftAutosaveOptions = {
  step: 'verify' | 'review' | 'signed';
  drafts: Record<string, string>;
  viewRef: { current: PublicAgreement | null };
  setView: (view: PublicAgreement) => void;
  setError: (message: string) => void;
  loadReview: (purpose: 'sign' | 'view') => Promise<void>;
};

/** Serialises revision-aware field saves and keeps edits recoverable during rate limits/conflicts. */
export function useAgreementDraftAutosave({
  step,
  drafts,
  viewRef,
  setView,
  setError,
  loadReview,
}: DraftAutosaveOptions) {
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const draftsRef = useRef<Record<string, string>>({});
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const flushRef = useRef<() => Promise<PublicAgreement | null>>();
  const pausedUntil = useRef(0);
  const timers = useRef<Set<number>>(new Set());
  const mounted = useRef(true);
  draftsRef.current = drafts;

  /** Tracked timeouts, so nothing fires (or sets state) after the page is gone. */
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.current.delete(id); if (mounted.current) fn(); }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => { mounted.current = false; pending.forEach((id) => window.clearTimeout(id)); pending.clear(); };
  }, []);

  /** Editable fields whose typed value differs from the current server revision. */
  const dirtyChanges = useCallback((): DraftChange[] => {
    const current = viewRef.current;
    if (!current) return [];
    return Object.entries(draftsRef.current).flatMap(([path, value]) => {
      const field = current.fields[path];
      if (!field || !['client', 'either'].includes(field.owner) || value === toText(field.value)) return [];
      return [{ path, value, expected_revision: field.revision, entered_by_staff: false as const }];
    });
  }, [viewRef]);

  const markSaves = useCallback((paths: string[], state: SaveState | null) => {
    setSaveState((old) => {
      const next = { ...old };
      for (const path of paths) {
        if (state) next[path] = state;
        else delete next[path];
      }
      return next;
    });
  }, []);

  /** Saves all pending edits in sequence, using each server-returned revision for the next save. */
  const flushDrafts = useCallback((): Promise<PublicAgreement | null> => {
    const run = async (): Promise<PublicAgreement | null> => {
      const changes = dirtyChanges();
      if (!changes.length) return viewRef.current;
      const paths = changes.map((change) => change.path);
      if (Date.now() < pausedUntil.current) {
        markSaves(paths, 'error');
        return null;
      }
      markSaves(paths, 'saving');
      try {
        const updated = await apiClient.patch<PublicAgreement>(
          '/public/agreements/session/fields',
          { changes },
        );
        viewRef.current = updated;
        setView(updated);
        setError('');
        const refused = (updated as { rejected?: Record<string, string> }).rejected ?? {};
        const refusedPaths = Object.keys(refused);
        markSaves(paths.filter((path) => !refusedPaths.includes(path)), 'saved');
        if (refusedPaths.length) {
          markSaves(refusedPaths, 'error');
          setError(Object.entries(refused).map(([path, message]) => `${fieldLabel(path)}: ${message}`).join(' '));
        }
        later(() => setSaveState((old) => {
          const next = { ...old };
          for (const path of paths) if (next[path] === 'saved') delete next[path];
          return next;
        }), 3000);
        return updated;
      } catch (cause) {
        if (cause instanceof Error && 'status' in cause && (cause as { status: number }).status === 409) {
          markSaves(paths, null);
          try {
            await loadReview('sign');
            setError('Someone updated this agreement while you were editing. The latest saved version is now shown; please review it and re-enter any change.');
          } catch {
            setError('This review session expired. Verify again to continue.');
          }
        } else if (cause instanceof ApiError && cause.status === 429) {
          const wait = Math.min(Math.max(cause.retryAfter ?? 20, 3), 120);
          pausedUntil.current = Date.now() + wait * 1000;
          markSaves(paths, 'error');
          setError(`Saving is paused for ${wait} seconds because of many quick saves. Your changes are kept here and will save automatically.`);
          later(() => { void flushRef.current?.(); }, (wait + 1) * 1000);
        } else {
          markSaves(paths, 'error');
          setError(cause instanceof Error ? cause.message : 'Some changes could not be saved.');
        }
        return null;
      }
    };
    const next = saveQueue.current.then(run, run);
    saveQueue.current = next;
    return next;
  }, [dirtyChanges, later, loadReview, markSaves, setError, setView, viewRef]);
  flushRef.current = flushDrafts;

  const saveField = (path: string, value: string) => {
    draftsRef.current = { ...draftsRef.current, [path]: value };
    void flushDrafts();
  };

  useEffect(() => {
    if (step !== 'review') return undefined;
    const timer = window.setTimeout(() => {
      if (dirtyChanges().length) void flushDrafts();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [drafts, step, dirtyChanges, flushDrafts]);

  useEffect(() => {
    if (step !== 'review') return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyChanges().length || Object.values(saveState).includes('saving')) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, saveState, dirtyChanges]);

  return { saveState, saveField, flushDrafts };
}
