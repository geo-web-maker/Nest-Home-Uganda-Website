/** Date arithmetic for agreement dates. Works on calendar days in UTC so time zones and daylight saving cannot shift a result. */
export type DateUnit = 'days' | 'weeks' | 'months' | 'years';
export type DateCalcInput = {
  /** ISO date, YYYY-MM-DD. */
  start: string;
  amount: number;
  unit: DateUnit;
  direction: 'after' | 'before';
  /** The start day counts as day 1, so the period ends the day before the plain result (6 months from 1 Jan ends 30 Jun). */
  startDayCounts: boolean;
};

export const DATE_UNITS: DateUnit[] = ['days', 'weeks', 'months', 'years'];

function parse(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

const format = (date: Date): string => date.toISOString().slice(0, 10);

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Adds calendar months; a day that does not exist in the target month moves to that month's last day (31 Aug + 6 months = 28 Feb). */
function addMonths(date: Date, months: number): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
}

/** The resulting ISO date, or null when the start date or amount is not valid. */
export function calcDate({ start, amount, unit, direction, startDayCounts }: DateCalcInput): string | null {
  const from = parse(start);
  if (!from || !Number.isInteger(amount) || amount < 0 || amount > 100000) return null;
  const sign = direction === 'before' ? -1 : 1;
  let result: Date;
  if (unit === 'days') result = addDays(from, sign * amount);
  else if (unit === 'weeks') result = addDays(from, sign * amount * 7);
  else result = addMonths(from, sign * amount * (unit === 'years' ? 12 : 1));
  if (startDayCounts) result = addDays(result, -sign);
  return format(result);
}

export function describeDate(iso: string): string {
  const date = parse(iso);
  return date ? date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
}
