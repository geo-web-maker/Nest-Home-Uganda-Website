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
    // `!important` is not part of a value: setProperty() rejects "none !important", which un-hid preheaders.
    const content = declaration.slice(separator + 1).replace(/\s*!important\s*$/i, '').trim();
    if (!ALLOWED.has(property) || !content || DANGEROUS.test(content)) continue;
    safe[property] = content.slice(0, 500);
  }
  return safe;
}

const ZERO = /^0+(\.0+)?(px|pt|em|rem|%|ex|ch|vh|vw)?$/;

/**
 * True when an inline style hides its element from the reader: display:none, visibility:hidden,
 * opacity:0, mso-hide:all, or a clipped box (overflow:hidden with a zero height or width).
 * Senders use these for the "preview line" at the top of a message. font-size:0 is not counted:
 * layouts also use it on wrappers whose children have their own size.
 */
export function isHiddenStyle(value: string): boolean {
  const props = new Map<string, string>();
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    const content = declaration.slice(separator + 1).replace(/\s*!important\s*$/i, '').trim().toLowerCase();
    if (content) props.set(name, content);
  }
  if (props.get('display') === 'none') return true;
  const visibility = props.get('visibility');
  if (visibility === 'hidden' || visibility === 'collapse') return true;
  const opacity = props.get('opacity');
  if (opacity !== undefined && ZERO.test(opacity)) return true;
  if (props.get('mso-hide') === 'all') return true;
  const overflow = props.get('overflow') ?? props.get('overflow-x') ?? props.get('overflow-y');
  if (overflow === 'hidden' || overflow === 'clip') {
    return ['max-height', 'max-width', 'height', 'width'].some((name) => {
      const size = props.get(name);
      return size !== undefined && ZERO.test(size);
    });
  }
  return false;
}

/** Invisible filler that senders append to the preview line (combining grapheme joiner, zero-width space, soft hyphen, BOM). */
// eslint-disable-next-line no-misleading-character-class -- these characters are exactly what is being removed
export const INVISIBLE_FILLER = /[\u034f\u200b\u2060\ufeff\u00ad]|\u200c{2,}/g;
