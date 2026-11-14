import { describe, expect, it } from 'vitest';
import { normalizeAdminUrl } from './normalizeAdminUrl';

const origin = 'https://admin.bhcug.com';

describe('normalizeAdminUrl', () => {
  it.each([
    ['/admin', '/'],
    ['/admin/mail', '/mail'],
    ['/admin/care/sos/5?x=1', '/care/sos/5?x=1'],
    ['/admin/care/clients?x=1#h', '/care/clients?x=1#h'],
    ['/mail', '/mail'],
    ['/administrator', '/administrator'],
    ['https://admin.bhcug.com/admin/mail?x=1#h', '/mail?x=1#h'],
  ])('normalizes %s', (input, output) => {
    expect(normalizeAdminUrl(input, origin)).toBe(output);
  });

  it('does not rewrite an absolute URL on another origin', () => {
    expect(normalizeAdminUrl('https://bhcug.com/admin/mail', origin)).toBe('https://bhcug.com/admin/mail');
  });
});
