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
 * muted: Inactive, unknown or not yet classified
 */
export type BadgeTone = 'default' | 'new' | 'blue' | 'purple' | 'red' | 'muted';

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

const RED = /^(open|critical|danger|sent|failed|error|cancelled|canceled|missed|declined|rejected|stale|revoked)$/;
const GOOD = /^(completed|complete|approved|resolved|active|success|live|delivered|verified|online|recent)$/;
const WARN = /^(warning|pending|scheduled|acknowledged|in_progress|in-progress|queued|draft|new|invited|review)$/;

/** One mapping from a care or workflow status word to a badge colour, so a status looks the same on every page. */
export function statusTone(status: unknown): BadgeTone {
  const key = String(status ?? '').trim().toLowerCase().replace(/[\s]+/g, '_');
  if (RED.test(key)) return 'red';
  if (GOOD.test(key)) return 'default';
  if (WARN.test(key)) return 'new';
  return 'muted';
}

/** A Badge coloured from a status word. The visible text is the children. */
export function StatusBadge({ status, children, className }: { status: unknown; children: ReactNode; className?: string }) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {children}
    </Badge>
  );
}
