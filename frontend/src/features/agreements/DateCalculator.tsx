import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DATE_UNITS, calcDate, describeDate, type DateUnit } from './dateCalc';
import styles from './DateCalculator.module.css';

export type CalcDateField = { path: string; label: string; value: string; writable: boolean };
type Props = { fields: CalcDateField[]; busy: boolean; onUse: (path: string, iso: string) => void };

/** Works out "6 months from the start" or "2 weeks before that date" so nobody counts by hand. */
export function DateCalculator({ fields, busy, onUse }: Props) {
  const [start, setStart] = useState('');
  const [amount, setAmount] = useState('6');
  const [unit, setUnit] = useState<DateUnit>('months');
  const [direction, setDirection] = useState<'after' | 'before'>('after');
  const [startDayCounts, setStartDayCounts] = useState(false);
  const [target, setTarget] = useState('');
  const filled = fields.filter((field) => /^\d{4}-\d{2}-\d{2}$/.test(field.value));
  const writable = fields.filter((field) => field.writable);
  const result = useMemo(
    () => calcDate({ start, amount: amount === '' ? NaN : Number(amount), unit, direction, startDayCounts }),
    [start, amount, unit, direction, startDayCounts],
  );
  const chosen = writable.find((field) => field.path === target) ?? writable[0];

  return (
    <details className={styles.box}>
      <summary>Date calculator</summary>
      <div className={styles.grid}>
        <label>Start from<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        {filled.length > 0 && <label>or use a saved date
          <select value="" onChange={(e) => { if (e.target.value) setStart(e.target.value); }}>
            <option value="">Choose…</option>
            {filled.map((field) => <option key={field.path} value={field.value}>{field.label} ({field.value})</option>)}
          </select>
        </label>}
        <label>Amount<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <label>Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as DateUnit)}>
            {DATE_UNITS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <label>Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'after' | 'before')}>
            <option value="after">after the start</option>
            <option value="before">before the start</option>
          </select>
        </label>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={startDayCounts} onChange={(e) => setStartDayCounts(e.target.checked)} />
        The start day counts as day 1 (a 6-month period from 1 Jan then ends 30 Jun)
      </label>
      <p className={result ? styles.result : styles.hint} role="status">
        {result ? <><strong>{result}</strong> · {describeDate(result)}</> : 'Pick a start date and an amount.'}
      </p>
      {result && chosen && <div className={styles.use}>
        <label>Put it in
          <select value={chosen.path} onChange={(e) => setTarget(e.target.value)}>
            {writable.map((field) => <option key={field.path} value={field.path}>{field.label}</option>)}
          </select>
        </label>
        <Button size="compact" onClick={() => onUse(chosen.path, result)} disabled={busy}>Save to field</Button>
      </div>}
    </details>
  );
}
