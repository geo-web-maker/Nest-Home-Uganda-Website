/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { useEffect, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'error' | 'success';

interface NoticeProps {
  tone?: NoticeTone;
  /** Defaults to "alert" for errors and "status" for everything else. Pass null for no live region. */
  role?: 'alert' | 'status' | null;
  className?: string;
  /** Float above the page (a toast) so the message is seen without scrolling. Pair with onDismiss. */
  floating?: boolean;
  /** Called by the close button and, for non-error toasts, after a few seconds. */
  onDismiss?: () => void;
  children: ReactNode;
}

const AUTO_DISMISS_MS = 6000;

/** The one inline message box: errors, confirmations and plain notes look and announce the same everywhere. */
export function Notice({ tone = 'info', role, className, floating = false, onDismiss, children }: NoticeProps) {
  const resolved = role === undefined ? (tone === 'error' ? 'alert' : 'status') : (role ?? undefined);

  useEffect(() => {
    if (!floating || !onDismiss || tone === 'error') return undefined;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [floating, onDismiss, tone, children]);

  return (
    <div role={resolved} className={cx(styles.notice, styles[tone], floating && styles.floating, className)} data-tone={tone}>
      <div className={styles.body}>{children}</div>
      {floating && onDismiss ? <button type="button" className={styles.close} aria-label="Dismiss message" onClick={onDismiss}>×</button> : null}
    </div>
  );
}
