import type { ReactNode } from 'react';
import styles from './LoadingNote.module.css';

/** Inline loading message with a spinner. The text stays the accessible name; the spinner is decorative. */
export function LoadingNote({ children }: { children: ReactNode }) {
  return (
    <p className={styles.note} role="status" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      {children}
    </p>
  );
}
