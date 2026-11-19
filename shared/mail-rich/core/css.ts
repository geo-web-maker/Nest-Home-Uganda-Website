import policy from '../policy/mail-html-policy.json';

const ALLOWED = new Set(policy.allowed_style_properties);
const DANGEROUS = /(url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding)/i;

export function filterMailStyle(value: string): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    // `!important` is not part of a value: setProperty() rejects "none !important", which un-hid preheaders.
    const content = declaration.slice(separator + 1).replace(/\s*!important\s*$/i, '').trim();
    if (!ALLOWED.has(property) || !content || DANGEROUS.test(content)) continue;
    safe[property] = content.slice(0, 500);
  }
  return safe;
}
