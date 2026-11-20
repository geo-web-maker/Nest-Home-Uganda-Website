/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
/** Shared mail-rich core behaviour tests. Written, not run here. */
import { describe, expect, it } from 'vitest';
import { formatBytes } from '../core/bytes';
import { blockedExtension, safeFilename } from '../core/attachments';
import { parseRecipients, replyRecipients } from '../core/recipients';
import { sanitizeToString } from '../core/sanitize';
import { filterMailStyle } from '../core/css';

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

  it('keeps display:none when a sender writes it with !important, so hidden preheaders stay hidden', () => {
    expect(filterMailStyle('display:none !important;max-width:0')).toEqual({ display: 'none', 'max-width': '0' });
    expect(filterMailStyle('color:red!IMPORTANT')).toEqual({ color: 'red' });
  });

  it('drops preview lines hidden by inline style, and invisible filler characters', () => {
    const html = sanitizeToString(
      '<div style="display:none !important">Welcome preview</div>'
      + '<div style="max-height:0;overflow:hidden;opacity:0">more preview</div>'
      + '<div style="mso-hide:all">outlook preview</div>'
      + '<p>Real\u034f\u200b text</p><td style="font-size:0"><span>kept</span></td>',
    );
    expect(html).not.toContain('preview');
    expect(html).toContain('<p>Real text</p>');
    expect(html).toContain('kept');
  });

  it('drops elements the sender hid with the hidden attribute and keeps percentage widths', () => {
    const html = sanitizeToString('<div hidden>preview line</div><table width="100%" bgcolor="#f1f1f1"><tr><td>Hi</td></tr></table>');
    expect(html).not.toContain('preview line');
    expect(html).toContain('width="100%"');
    expect(html).toContain('bgcolor="#f1f1f1"');
  });
});
