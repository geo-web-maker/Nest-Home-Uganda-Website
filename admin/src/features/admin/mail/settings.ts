export type MailSetting = {
  key: string;
  group: string;
  label: string;
  help: string;
  type: string;
  default: unknown;
  value?: unknown;
  is_secret: boolean;
  is_set?: boolean;
  choices?: string[];
  minimum?: number;
  maximum?: number;
};

/** Text shown in an input for a stored value. Lists are comma separated; missing values are empty. */
export function displayValue(type: string, value: unknown): string {
  if (type === 'list') return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  return value === undefined || value === null ? '' : String(value);
}

/** The value sent to the server for what was typed. Returns undefined for a number that is not a number. */
export function coerceSettingValue(type: string, raw: string | boolean): unknown {
  if (type === 'boolean') return Boolean(raw);
  const text = String(raw);
  if (type === 'integer') {
    const parsed = Number.parseInt(text, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (type === 'number') {
    const parsed = Number(text);
    return text.trim() === '' || Number.isNaN(parsed) ? undefined : parsed;
  }
  if (type === 'list') {
    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return text;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type SetupCheck = { id: string; status: CheckStatus; detail: string };
export type CheckSummary = Record<CheckStatus, number>;

/** Badge colour for a check result: green, amber, red, grey. */
export const CHECK_TONE = { pass: 'default', warn: 'new', fail: 'red', skip: 'muted' } as const;
