import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'error' | 'success';

interface NoticeProps {
  tone?: NoticeTone;
  /** Defaults to "alert" for errors and "status" for everything else. Pass null for no live region. */
  role?: 'alert' | 'status' | null;
  className?: string;
  children: ReactNode;
}

/** The one inline message box: errors, confirmations and plain notes look and announce the same everywhere. */
export function Notice({ tone = 'info', role, className, children }: NoticeProps) {
  const resolved = role === undefined ? (tone === 'error' ? 'alert' : 'status') : (role ?? undefined);
  return (
    <div role={resolved} className={cx(styles.notice, styles[tone], className)} data-tone={tone}>
      {children}
    </div>
  );
}
