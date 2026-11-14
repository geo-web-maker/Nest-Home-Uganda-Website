/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
/** Shared mail-rich core behaviour tests. Written, not run here. */
import { describe, expect, it } from 'vitest';
import { formatBytes } from '../core/bytes';
import { blockedExtension, safeFilename } from '../core/attachments';
import { parseRecipients, replyRecipients } from '../core/recipients';
import { sanitizeToString } from '../core/sanitize';

describe('shared mail-rich core', () => {
  it('normalises recipient lists and removes duplicates', () => {
    expect(parseRecipients('Person <A@example.test>; b@example.test, a@example.test')).toEqual([
      'a@example.test', 'b@example.test',
    ]);
  });

  it('keeps reply-all recipients separate from the sender and own addresses', () => {
    expect(replyRecipients(
      [{ kind: 'to', address: 'me@example.test' }, { kind: 'cc', address: 'team@example.test' }],
      'sender@example.test',
      ['me@example.test'],
      true,
    )).toEqual({ to: ['sender@example.test'], cc: ['team@example.test'] });
  });

  it('cleans filenames and recognises a blocked final extension', () => {
    expect(safeFilename('../invoice\u202eexe.pdf')).not.toContain('/');
    expect(blockedExtension('invoice.pdf.exe')).toBe(true);
  });

  it('formats byte sizes and sanitises active HTML without flattening safe structure', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    const clean = sanitizeToString('<h2>Contract</h2><script>alert(1)</script><p onclick="x()">Safe</p>');
    expect(clean).toContain('<h2>Contract</h2>');
    expect(clean).toContain('<p>Safe</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });
});
