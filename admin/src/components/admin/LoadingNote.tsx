import type { ReactNode } from 'react';
import styles from './LoadingNote.module.css';

/** Bare spinner for places with no room for a message (a count still loading, a button label). Decorative. */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

/**
 * Loading message with a spinner. The text stays the accessible name; the spinner is decorative.
 * `inline` renders a span so it can sit inside a paragraph, a heading note or a button.
 */
export function LoadingNote({ children, inline = false }: { children: ReactNode; inline?: boolean }) {
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag className={inline ? `${styles.note} ${styles.inline}` : styles.note} role="status" aria-busy="true">
      <Spinner />
      {children}
    </Tag>
  );
}
