/** How an invoice item's service date is stored: `YYYY-MM-DD`, or `YYYY-MM-DD to YYYY-MM-DD` for a period. */
export type ServiceMode = 'none' | 'date' | 'period';

export type ServiceValue = {
  mode: ServiceMode;
  start: string;
  end: string;
  /** Free text typed before dates had a selector. Kept until a date or period replaces it. */
  legacy: string;
};

const STORED = /^(\d{4}-\d{2}-\d{2})(?: to (\d{4}-\d{2}-\d{2}))?$/;

export const emptyService = (): ServiceValue => ({ mode: 'none', start: '', end: '', legacy: '' });

export function parseServiceDate(text?: string | null): ServiceValue {
  const raw = (text ?? '').trim();
  if (!raw) return emptyService();
  const match = STORED.exec(raw);
  if (!match) return { ...emptyService(), legacy: raw };
  const [, start = '', end = ''] = match;
  return end && end !== start
    ? { mode: 'period', start, end, legacy: '' }
    : { mode: 'date', start, end: '', legacy: '' };
}

export function composeServiceDate(value: ServiceValue): string {
  if (value.mode === 'date') return value.start;
  if (value.mode === 'period') return value.start && value.end ? `${value.start} to ${value.end}` : '';
  return value.legacy;
}

export type ServiceProblem = '' | 'incomplete' | 'order';

export function serviceProblem(value: ServiceValue): ServiceProblem {
  if (value.mode !== 'period') return '';
  if (!value.start || !value.end) return 'incomplete';
  return value.end < value.start ? 'order' : '';
}

/** The period an agreement covers, as a service value, or none when the agreement has no usable dates. */
export function serviceFromAgreement(start: string, end: string): ServiceValue {
  if (!start) return emptyService();
  return end && end !== start
    ? { mode: 'period', start, end, legacy: '' }
    : { mode: 'date', start, end: '', legacy: '' };
}
