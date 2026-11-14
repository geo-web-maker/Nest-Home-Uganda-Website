/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import { useEffect, useRef, useState } from 'react';

export function useDraftAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs = 800,
) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('saving');
    const handle = window.setTimeout(() => {
      void save(value).then(
        () => setStatus('saved'),
        () => setStatus('error'),
      );
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, save, value]);

  return status;
}
