import { useCallback, useEffect, useRef, useState } from 'react';

/** Failure and safety messages must not vanish on their own: the nurse may be looking elsewhere when they arrive. */
export function isProblemMessage(text: string): boolean {
  return /\b(could not|couldn.t|unavailable|failed|cannot|can.t be|blocked|not enabled|not available|saved to retry|not confirmed|rejected|discarded)\b/i.test(text);
}

/** A single transient status message; longer-running sync state is shown separately. */
export function useToast(durationMs = 6_000): [string, (message: string) => void] {
  const [message, setMessageState] = useState('');
  const timeout = useRef<number | undefined>(undefined);
  const setMessage = useCallback((next: string) => {
    if (timeout.current !== undefined) window.clearTimeout(timeout.current);
    setMessageState(next);
    timeout.current = next && !isProblemMessage(next) ? window.setTimeout(() => {
      timeout.current = undefined;
      setMessageState('');
    }, durationMs) : undefined;
  }, [durationMs]);
  useEffect(() => () => {
    if (timeout.current !== undefined) window.clearTimeout(timeout.current);
  }, []);
  return [message, setMessage];
}
