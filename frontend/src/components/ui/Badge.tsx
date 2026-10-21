import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Badge.module.css';

/**
 * Admin status colours (spec 2.2).
 * default: Live, Care started, Active, Approved
 * new: New, Draft, Pending, Received, Invited
 * blue: Contacted, Shortlisted
 * purple: Assessment booked, Interview
 * red: Not proceeding, Closed, Declined
 */
export type BadgeTone = 'default' | 'new' | 'blue' | 'purple' | 'red';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'default', children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} data-tone={tone}>
      {children}
    </span>
  );
}
