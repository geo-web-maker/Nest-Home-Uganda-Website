import { Fragment } from 'react';
import { fieldLabel } from '@shared/features/agreements/fieldMeta';
import styles from './AgreementsPage.module.css';

export type AgreementEvent = {
  type: string;
  at: string;
  actor: string;
  detail: Record<string, unknown>;
};

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function describeEvent(event: AgreementEvent): { title: string; summary?: string; tone: string } {
  const detail = event.detail ?? {};
  if (event.type === 'field_changed') {
    const path = String(detail.path ?? '');
    const from = valueText(detail.old_value) || 'empty';
    const to = valueText(detail.new_value) || 'empty';
    const summary = `${from.length > 60 ? `${from.slice(0, 60)}…` : from} → ${to.length > 60 ? `${to.slice(0, 60)}…` : to}${detail.overwrote_newer_revision ? ' (replaced a newer edit)' : ''}`;
    return { title: `${fieldLabel(path)} updated`, summary, tone: 'edit' };
  }
  const tone = /sign|complet/.test(event.type)
    ? 'done'
    : /void|expire|delete/.test(event.type)
      ? 'closed'
      : /sent|resend|revised|remind|link/.test(event.type)
        ? 'send'
        : 'info';
  const reason = typeof detail.reason === 'string' ? detail.reason : undefined;
  return {
    title: event.type.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase()),
    summary: reason ? `Reason: ${reason}` : undefined,
    tone,
  };
}

/** Chronological agreement audit history with day separators and readable event details. */
export function AgreementTimeline({ events }: { events: AgreementEvent[] }) {
  const ordered = [...events]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => new Date(b.event.at).getTime() - new Date(a.event.at).getTime() || b.index - a.index);
  if (!ordered.length) return <p className={styles.empty}>No activity yet.</p>;

  let lastDay = '';
  return (
    <div className={styles.historyScroll}>
      <ol className={styles.history}>
        {ordered.map(({ event, index }) => {
          const date = new Date(event.at);
          const day = date.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
          const heading = day !== lastDay
            ? <li className={styles.historyDay} key={`day-${day}-${index}`} aria-hidden="true">{day}</li>
            : null;
          lastDay = day;
          const info = describeEvent(event);
          const who = event.actor === 'client'
            ? 'Client'
            : event.actor === 'system'
              ? 'System'
              : `Staff ${String(event.actor).slice(-4)}`;
          return (
            <Fragment key={`${event.type}-${event.at}-${index}`}>
              {heading}
              <li className={`${styles.historyItem} ${styles[`tone_${info.tone}`] ?? ''}`}>
                <div className={styles.historyHead}>
                  <strong>{info.title}</strong>
                  <time dateTime={event.at}>
                    {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
                {info.summary && <p className={styles.historySummary}>{info.summary}</p>}
                <small>{who}</small>
                <details>
                  <summary>Details</summary>
                  <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                </details>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
