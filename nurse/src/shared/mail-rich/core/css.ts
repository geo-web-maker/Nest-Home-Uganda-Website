/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import policy from '../policy/mail-html-policy.json';

const ALLOWED = new Set(policy.allowed_style_properties);
const DANGEROUS = /(url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding)/i;

export function filterMailStyle(value: string): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const content = declaration.slice(separator + 1).trim();
    if (!ALLOWED.has(property) || !content || DANGEROUS.test(content)) continue;
    safe[property] = content.slice(0, 500);
  }
  return safe;
}
