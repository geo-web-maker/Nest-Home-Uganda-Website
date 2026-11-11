/** Uganda phone numbers (spec 6.4). Mirrors backend/app/core/phone.py: keep the two in step. */

const UG = /^(?:\+?256|0)[37]\d{8}$/;

function compact(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/** '0787 499 988' -> '+256787499988', or null when it is not a Uganda number. */
export function normaliseUgPhone(raw: string): string | null {
  const value = compact(raw.trim());
  if (!UG.test(value)) return null;
  return '+256' + value.replace(/^\+/, '').replace(/^256/, '').replace(/^0/, '');
}

export function isValidUgPhone(raw: string): boolean {
  return normaliseUgPhone(raw) !== null;
}

/** '+256787499988' -> '0787 499 988' for display. Anything else comes back unchanged. */
export function formatUgPhone(e164: string): string {
  const match = /^\+256([37]\d{2})(\d{3})(\d{3})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164;
}
