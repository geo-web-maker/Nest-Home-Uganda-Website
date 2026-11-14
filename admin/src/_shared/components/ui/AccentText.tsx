/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './AccentText.module.css';

interface AccentTextProps {
  children: ReactNode;
  className?: string;
}

/** The gold script phrase inside a heading. Use one per heading. */
export function AccentText({ children, className }: AccentTextProps) {
  return <em className={cx(styles.accent, className)}>{children}</em>;
}
