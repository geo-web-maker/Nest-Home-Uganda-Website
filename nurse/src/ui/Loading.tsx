import type { ReactNode } from 'react';

/** Inline wait: a small spinner and the message. The text is the accessible name; the spinner is decorative. */
export function LoadingNote({ children }: { children: ReactNode }) {
  return <p className="mk-loading-note" role="status" aria-busy="true"><span className="mk-spinner" aria-hidden="true" />{children}</p>;
}

/** Full-screen wait (opening the app). */
export function LoadingScreen({ label = 'Opening your schedule…' }: { label?: string }) {
  return <div className="mk-loading-screen" role="status" aria-busy="true"><span className="mk-spinner mk-spinner--lg" aria-hidden="true" /><p>{label}</p></div>;
}
