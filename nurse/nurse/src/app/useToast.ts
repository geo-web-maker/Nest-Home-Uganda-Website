import { useCallback, useEffect, useRef, useState } from 'react';

/** A single transient status message; longer-running sync state is shown separately. */
export function useToast(durationMs = 6_000): [string, (message: string) => void] {
  const [message, setMessageState] = useState('');
  const timeout = useRef<number | undefined>(undefined);
  const setMessage = useCallback((next: string) => {
    if (timeout.current !== undefined) window.clearTimeout(timeout.current);
    setMessageState(next);
    timeout.current = next ? window.setTimeout(() => {
      timeout.current = undefined;
      setMessageState('');
    }, durationMs) : undefined;
  }, [durationMs]);
  useEffect(() => () => {
    if (timeout.current !== undefined) window.clearTimeout(timeout.current);
  }, []);
  return [message, setMessage];
}
