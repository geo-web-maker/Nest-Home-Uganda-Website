/** Pure care-forms rules for the nurse app. The server re-checks every one of these (IMPLEMENT.md rules 3, 4, 6, 7, 9). */
import { FORM_DEFS, type FormDef } from './formDefs';

export type PatientType = 'Mama' | 'Baby' | 'General';
export type DocStatus = 'draft' | 'pending' | 'signed';
export const FEVER_C = 37.5;
export const LOW_BABY_C = 36.5;
export const CLIENT_FORMS = ['03', '04', '05', '06', '11', '12'] as const;
export const OPTIONAL_CLIENT_FORMS = ['07'] as const;
export const NURSE_ONLY = ['01', '02', '08', '09', '10', 'tracker'] as const;
export const MIN_PASSPHRASE = 8;

export const FORM_GROUPS: { id: 'before' | 'during' | 'tracker' | 'events'; title: string; forms: string[] }[] = [
  { id: 'before', title: 'Before care', forms: ['03', '01', '02', '04', '05', '06'] },
  { id: 'during', title: 'During the visit', forms: ['07', '08', '09'] },
  { id: 'tracker', title: 'Daily tracker', forms: ['tracker'] },
  { id: 'events', title: 'Events and end', forms: ['10', '11', '12'] },
];

export const defOf = (id: string): FormDef | undefined => FORM_DEFS.find((f) => f.id === id);
export const formTitle = (id: string) => (id === 'tracker' ? 'Weekly tracker' : `Form ${id}. ${defOf(id)?.title ?? ''}`.trim());
export const clientTakesPart = (id: string) => (CLIENT_FORMS as readonly string[]).includes(id);
export const clientOptional = (id: string) => (OPTIONAL_CLIENT_FORMS as readonly string[]).includes(id);
export const trackerKind = (type?: string | null): 'mama' | 'baby' | null => (type === 'Mama' ? 'mama' : type === 'Baby' ? 'baby' : null);
export const trackerAllowed = (type?: string | null) => trackerKind(type) !== null;
export function formsForGroup(groupForms: string[], type?: string | null) {
  return groupForms.filter((id) => id !== 'tracker' || trackerAllowed(type));
}

/** Arrive is blocked until Form 03 is signed. When the switch is off nothing is blocked. */
export function arriveBlocked(gatesEnabled: boolean, signedFormIds: Iterable<string>): boolean {
  return gatesEnabled && !new Set(signedFormIds).has('03');
}

export function abnormalTemp(value: unknown, baby = false): boolean {
  const t = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(t)) return false;
  return t > FEVER_C || (baby && t < LOW_BABY_C);
}
/** An abnormal temperature needs an action entry (or Form 10) before the visit is signed. */
export function tempNeedsAction(temp: unknown, action: unknown, hasForm10 = false, baby = false): boolean {
  return !hasForm10 && abnormalTemp(temp, baby) && !String(action ?? '').trim();
}

export type Registration = { unmc_number?: string | null; unmc_category?: string | null; unmc_licence_expiry?: string | null; verified?: boolean; status?: 'verified' | 'self-declared' };
/** Signing needs a number and an unexpired licence; otherwise the app shows a prompt that links to Profile. */
export function unmcProblem(reg: Registration | null | undefined, today = new Date().toISOString().slice(0, 10)): { code: 'missing' | 'expired'; message: string } | null {
  if (!reg?.unmc_number?.trim()) return { code: 'missing', message: 'Add your UNMC number to your profile before signing.' };
  if (!reg.unmc_licence_expiry) return { code: 'missing', message: 'Add your UNMC practising licence expiry date to your profile before signing.' };
  if (reg.unmc_licence_expiry < today) return { code: 'expired', message: 'Your UNMC practising licence has expired. Update your profile.' };
  return null;
}

export type ClientSigning = { role: string; method: string; name: string; authority?: string; esign: boolean; hasImage: boolean; passphrase?: string; confirm?: string; interpreter?: { name: string; address: string; language: string; signed: boolean } };
/** Client-side mirror of the server's signing rules (roles, methods, passphrase, thumbprint). Returns an error message or null. */
export function clientSigningProblem(s: ClientSigning): string | null {
  if (!['client', 'representative', 'interpreter', 'witness'].includes(s.role)) return 'Choose who is signing.';
  if (!s.esign) return 'Tick the box to agree to sign electronically.';
  if (!s.name.trim()) return 'Enter the signer’s name.';
  if (s.role === 'representative' && !s.authority?.trim()) return 'Record the representative’s authority.';
  if ((s.method === 'drawn' || s.method === 'thumbprint') && !s.hasImage) return s.method === 'drawn' ? 'A drawn signature is required.' : 'A thumbprint image is required.';
  if (s.method === 'password') {
    if ((s.passphrase ?? '').length < MIN_PASSPHRASE) return `Choose a passphrase of at least ${MIN_PASSPHRASE} characters.`;
    if (s.passphrase !== s.confirm) return 'The two passphrases do not match.';
  }
  if (s.method === 'thumbprint') {
    const i = s.interpreter;
    if (!i || !i.name.trim() || !i.address.trim() || !i.language.trim() || !i.signed) return 'A thumbprint needs the interpreter or reader’s name, address, language and signature.';
  }
  return null;
}
export function nurseSigningProblem(method: string, hasImage: boolean, password: string, online: boolean): string | null {
  if (method === 'drawn' && !hasImage) return 'A drawn signature is required.';
  if (method === 'password') {
    if (!online) return 'Account password signing needs a connection. Use Draw or Fingerprint / Face while offline.';
    if (!password) return 'Enter your account password.';
  }
  return null;
}

/** Rule 7 hint for the client-copy block. The server decides; the app never sends mail itself. */
export function copyHint(autoEmailOn: boolean, clientAgreed: boolean): string {
  if (!autoEmailOn) return 'Copies are not emailed. Hand over a paper copy.';
  return clientAgreed ? 'A sealed copy is emailed after you sign, if an address is on file.' : 'No email copy unless the client agrees below. Hand over a paper copy.';
}

/** Form 08 orders are read-only for nurses: only Given / Not given and a reason can be recorded. */
export function administrationProblem(a: { given?: boolean; reason?: string }): string | null {
  if (a.given === false && !String(a.reason ?? '').trim()) return 'Give a reason when a dose is not given.';
  return null;
}

/** Monday of the week containing the given YYYY-MM-DD (the tracker week starts on Monday). */
export function weekStartOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
export const addDays = (dateKey: string, n: number) => { const d = new Date(`${dateKey}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const TRACKER_FIELDS = {
  baby: [['temp', 'Temp °C'], ['fed', 'Fed'], ['bathed', 'Bathed'], ['massage_oil', 'Massage oil'], ['sleep', 'Sleep'], ['nappy', 'Nappy']],
  mama: [['temp', 'Temp °C'], ['pain', 'Pain'], ['breast', 'Breasts'], ['bleeding', 'Bleeding'], ['meals_water', 'Meals / water'], ['sleep_mood', 'Sleep / mood']],
} as const;
export const MAMA_CARE = [['tea', 'Tea therapy taken (time)'], ['counselling', 'Psychotherapy / counselling'], ['massage', 'Massage / oils (oil used)'], ['breastfeeding', 'Breastfeeding help / latching'], ['help_home', 'Help at home / hours rested']] as const;

/** Forms tied to one visit (their temperature entries count toward the check-out gate); the rest are per client. */
export const VISIT_SCOPED = ['07', '09', '10'] as const;
export const scopeVisitId = (formId: string, visitId: string | null | undefined) => ((VISIT_SCOPED as readonly string[]).includes(formId) ? visitId ?? null : null);
export const statusLabel = (status?: DocStatus, queued = false) => `${status === 'signed' ? 'Signed' : status === 'pending' ? 'Needs your signature' : status === 'draft' ? 'Draft' : 'Not started'}${queued ? ' · waiting to sync' : ''}`;
export const statusChip = (status?: DocStatus): 'ok' | 'rv' | 'pd' | 'sc' => (status === 'signed' ? 'ok' : status === 'pending' ? 'rv' : status === 'draft' ? 'pd' : 'sc');
