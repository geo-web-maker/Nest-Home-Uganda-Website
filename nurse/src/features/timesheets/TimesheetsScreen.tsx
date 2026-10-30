import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api/client';
import { copy } from '../../copy';
import { Card } from '../../ui/Card';
import { Chip, type ChipKind } from '../../ui/Chip';
import { Row } from '../../ui/Row';
import { PillButton } from '../../ui/PillButton';
import { Banner } from '../../ui/Banner';

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

function statusKind(status: string): ChipKind {
  if (status === 'approved') return 'ok';
  if (status === 'submitted') return 'pg';
  if (status === 'sent_back') return 'rv';
  return status === 'draft' ? 'pd' : 'sc';
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
    <section className="screen timesheets-screen mk-timesheets" aria-labelledby="timesheets-heading">
      <header className="screen-heading timesheets-heading mk-timesheets-heading">
        <div>
          <p className="eyebrow">{copy.timesheets.eyebrow}</p>
          <h2 id="timesheets-heading">{copy.timesheets.title}</h2>
          <p>{copy.timesheets.intro}</p>
        </div>
        <PillButton type="button" tone="ghost" size="sm" className="timesheets-retry" disabled={loading || !online} onClick={() => setReloadKey((value) => value + 1)}>
          {loading ? copy.timesheets.loading : copy.timesheets.refresh}
        </PillButton>
      </header>

      {!online && <Banner tone="warn">{copy.timesheets.offline}</Banner>}
      {online && loading && <Banner tone="info">{copy.timesheets.loading}</Banner>}
      {online && !loading && error && <Card className="mk-timesheets-empty" role="alert"><Banner tone="bad">{error}</Banner><PillButton tone="ghost" size="sm" onClick={() => setReloadKey((value) => value + 1)}>{copy.generic.retry}</PillButton></Card>}
      {online && !loading && !error && items.length === 0 && <Card className="mk-timesheets-empty"><h3>{copy.timesheets.emptyTitle}</h3><p>{copy.timesheets.empty}</p></Card>}

      {online && !loading && !error && items.length > 0 && (
        <div className="timesheets-layout mk-timesheets-layout">
          <Card className="timesheet-period-list mk-timesheets-list">
            <h3>{copy.timesheets.periodList}</h3>
            <div className="mk-timesheet-periods">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="timesheet-period mk-timesheet-period"
                  aria-pressed={item.id === selected?.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="timesheet-period-date">{dateLabel(item.period_start)} – {dateLabel(item.period_end)}</span>
                  <Chip kind={statusKind(item.status)}>{statusLabel(item.status)}</Chip>
                  <strong className="timesheet-period-total">{durationLabel(item.total_minutes)}</strong>
                </button>
              ))}
            </div>
          </Card>

          {selected && (
            <Card className="panel timesheet-detail mk-timesheet-detail" aria-labelledby="timesheet-detail-heading">
              <div className="screen-heading mk-timesheet-detail-heading">
                <div>
                  <p className="eyebrow">{copy.timesheets.periodKinds[selected.period_kind as keyof typeof copy.timesheets.periodKinds] ?? copy.timesheets.unknownPeriod}</p>
                  <h3 id="timesheet-detail-heading">{dateLabel(selected.period_start)} – {dateLabel(selected.period_end)}</h3>
                </div>
                <Chip kind={statusKind(selected.status)}>{statusLabel(selected.status)}</Chip>
              </div>
              <div className="mk-timesheet-total">
                <span>{copy.timesheets.verifiedHours}</span>
                <strong>{durationLabel(selected.total_minutes)}</strong>
              </div>
              <div className="timesheet-summary mk-timesheet-summary">
                <Row label={copy.timesheets.completedVisits} value={selected.completed_visits} />
                <Row label={copy.timesheets.issues} value={selected.issue_count} />
              </div>
              {selected.status === 'approved' && <Banner tone="ok">{copy.timesheets.approvedLocked}</Banner>}
              {selected.status === 'sent_back' && selected.sent_back_reason && <section className="timesheet-reason mk-timesheet-reason"><h4>{copy.timesheets.sentBackReason}</h4><p>{selected.sent_back_reason}</p></section>}
              {selected.issues.length > 0 && (
                <section className="timesheet-issues mk-timesheet-issues">
                  <h4>{copy.timesheets.issueExplanations}</h4>
                  {selected.issues.map((issue) => (
                    <div className="timesheet-issue mk-timesheet-issue" key={issue.number}>
                      <strong>{copy.timesheets.issueLabel} {issue.number}</strong>
                      <Chip kind={issue.status === 'explained' ? 'ok' : 'rv'}>{issue.status === 'explained' ? copy.timesheets.explained : copy.timesheets.needsExplanation}</Chip>
                      {issue.explanation && <p>{issue.explanation}</p>}
                    </div>
                  ))}
                </section>
              )}
              <p className="privacy-hint">{copy.timesheets.readOnly}</p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
