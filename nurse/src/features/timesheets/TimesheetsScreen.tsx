import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api/client';
import { copy } from '../../copy';

type TimesheetIssue = {
  number: number;
  status: 'explained' | 'needs_explanation' | string;
  explanation: string | null;
};

type NurseTimesheet = {
  id: string;
  period_start: string;
  period_end: string;
  period_kind: string;
  status: 'draft' | 'submitted' | 'approved' | 'sent_back' | string;
  completed_visits: number;
  total_minutes: number;
  issue_count: number;
  issues: TimesheetIssue[];
  submitted_at: string | null;
  approved_at: string | null;
  sent_back_reason: string | null;
};

function dateLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function durationLabel(totalMinutes: number): string {
  const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours === 0) return `${minutes} ${copy.timesheets.minutes}`;
  if (minutes === 0) return `${hours} ${copy.timesheets.hours}`;
  return `${hours} ${copy.timesheets.hours} ${minutes} ${copy.timesheets.minutes}`;
}

function statusLabel(status: string): string {
  return copy.timesheets.statuses[status as keyof typeof copy.timesheets.statuses] ?? copy.timesheets.unknownStatus;
}

/** Read-only nurse timesheets. The field endpoint returns rows owned by the authenticated nurse. */
export function TimesheetsScreen({ online }: { online: boolean }) {
  const [items, setItems] = useState<NurseTimesheet[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!online) {
      setLoading(false);
      setItems([]);
      setSelectedId('');
      setError(copy.timesheets.offline);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError('');
    apiRequest<{ items: NurseTimesheet[] }>('/field/timesheets')
      .then((result) => {
        if (cancelled) return;
        const rows = Array.isArray(result.items) ? result.items : [];
        setItems(rows);
        setSelectedId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setSelectedId('');
          setError(copy.timesheets.unavailable);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [online, reloadKey]);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <section className="screen timesheets-screen" aria-labelledby="timesheets-heading">
      <header className="screen-heading timesheets-heading">
        <div>
          <p className="eyebrow">{copy.timesheets.eyebrow}</p>
          <h2 id="timesheets-heading">{copy.timesheets.title}</h2>
          <p>{copy.timesheets.intro}</p>
        </div>
        <button type="button" className="button-secondary timesheets-retry" disabled={loading || !online} onClick={() => setReloadKey((value) => value + 1)}>
          {loading ? copy.timesheets.loading : copy.timesheets.refresh}
        </button>
      </header>

      {!online && <p role="status" className="notice">{copy.timesheets.offline}</p>}
      {online && loading && <p role="status" className="panel">{copy.timesheets.loading}</p>}
      {online && !loading && error && <div className="empty-state" role="alert"><p>{error}</p><button type="button" className="button-secondary" onClick={() => setReloadKey((value) => value + 1)}>{copy.generic.retry}</button></div>}
      {online && !loading && !error && items.length === 0 && <div className="empty-state"><h3>{copy.timesheets.emptyTitle}</h3><p>{copy.timesheets.empty}</p></div>}

      {online && !loading && !error && items.length > 0 && (
        <div className="timesheets-layout">
          <section className="timesheet-period-list" aria-label={copy.timesheets.periodList}>
            <h3>{copy.timesheets.periodList}</h3>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="timesheet-period"
                aria-pressed={item.id === selected?.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="timesheet-period-date">{dateLabel(item.period_start)} – {dateLabel(item.period_end)}</span>
                <span className={`status-chip timesheet-status timesheet-status--${['draft', 'submitted', 'approved', 'sent_back'].includes(item.status) ? item.status : 'unknown'}`}>{statusLabel(item.status)}</span>
                <span className="timesheet-period-total">{durationLabel(item.total_minutes)}</span>
              </button>
            ))}
          </section>

          {selected && (
            <article className="panel timesheet-detail" aria-labelledby="timesheet-detail-heading">
              <div className="screen-heading">
                <div>
                  <p className="eyebrow">{copy.timesheets.periodKinds[selected.period_kind as keyof typeof copy.timesheets.periodKinds] ?? copy.timesheets.unknownPeriod}</p>
                  <h3 id="timesheet-detail-heading">{dateLabel(selected.period_start)} – {dateLabel(selected.period_end)}</h3>
                </div>
                <span className={`status-chip timesheet-status timesheet-status--${['draft', 'submitted', 'approved', 'sent_back'].includes(selected.status) ? selected.status : 'unknown'}`}>{statusLabel(selected.status)}</span>
              </div>
              <dl className="timesheet-summary">
                <div><dt>{copy.timesheets.verifiedHours}</dt><dd>{durationLabel(selected.total_minutes)}</dd></div>
                <div><dt>{copy.timesheets.completedVisits}</dt><dd>{selected.completed_visits}</dd></div>
                <div><dt>{copy.timesheets.issues}</dt><dd>{selected.issue_count}</dd></div>
              </dl>
              {selected.status === 'approved' && <p className="timesheet-lock-note">{copy.timesheets.approvedLocked}</p>}
              {selected.status === 'sent_back' && selected.sent_back_reason && <section className="timesheet-reason"><h4>{copy.timesheets.sentBackReason}</h4><p>{selected.sent_back_reason}</p></section>}
              {selected.issues.length > 0 && (
                <section className="timesheet-issues">
                  <h4>{copy.timesheets.issueExplanations}</h4>
                  {selected.issues.map((issue) => (
                    <div className="timesheet-issue" key={issue.number}>
                      <strong>{copy.timesheets.issueLabel} {issue.number}</strong>
                      <span className={`status-chip ${issue.status === 'explained' ? 'timesheet-issue--explained' : 'timesheet-issue--needs-explanation'}`}>
                        {issue.status === 'explained' ? copy.timesheets.explained : copy.timesheets.needsExplanation}
                      </span>
                      {issue.explanation && <p>{issue.explanation}</p>}
                    </div>
                  ))}
                </section>
              )}
              <p className="privacy-hint">{copy.timesheets.readOnly}</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
