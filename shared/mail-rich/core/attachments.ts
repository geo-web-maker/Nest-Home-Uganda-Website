import type { MailAttachment } from './types';

export const DEFAULT_BLOCKED_EXTENSIONS = new Set([
  'exe', 'js', 'jar', 'scr', 'bat', 'cmd', 'com', 'msi', 'vbs', 'iso', 'dll', 'ps1', 'lnk',
  'docm', 'xlsm', 'pptm',
]);

export function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the purpose
    .replace(/[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return Array.from(cleaned || 'attachment').slice(0, 180).join('');
}

export function blockedExtension(filename: string, blocked = DEFAULT_BLOCKED_EXTENSIONS): boolean {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return blocked.has(extension);
}

export function attachmentStatus(item: MailAttachment): 'blocked' | 'pending' | 'available' {
  if (item.blocked_reason || item.scan_state === 'blocked' || item.scan_state === 'infected') {
    return 'blocked';
  }
  if (item.scan_state === 'pending') return 'pending';
  return 'available';
}

export function attachmentTypeLabel(contentType: string): string {
  const subtype = contentType.split('/')[1]?.split(';')[0]?.toUpperCase();
  return subtype || 'FILE';
}
