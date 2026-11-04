const KNOWN: Record<string, string> = {
  user_id: 'Nurse ID', staff_number: 'Staff no.', supervisor_id: 'Supervisor', team_id: 'Team',
  phone_e164: 'Phone', active: 'Status', is_active: 'Status', created_at: 'Created',
  updated_at: 'Updated', scheduled_start: 'Starts', scheduled_end: 'Ends',
};

/** Turns an API field name into a readable column heading. */
export function headerFor(key: string): string {
  if (KNOWN[key]) return KNOWN[key];
  if (key === 'id') return 'ID';
  const words = key.replace(/_at$/, '').replace(/_id$/, ' ID').replaceAll('_', ' ').trim();
  return words.replace(/^./, (c) => c.toUpperCase());
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Plain-text cell: dashes for empty, Yes/No for booleans, local dates, no raw JSON dumps. */
export function cellText(key: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return /active/.test(key) ? (v ? 'Active' : 'Inactive') : v ? 'Yes' : 'No';
  if (typeof v === 'string' && ISO.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()))
      return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(d);
  }
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
