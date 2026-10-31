import { buildSeed, formatBytes, invalidRecipients, parseRecipients } from './recipients';
import { coerceSettingValue, displayValue } from './settings';
import type { MailRecipient } from './types';

describe('parseRecipients', () => {
  it('splits on commas, semicolons and line breaks, trims, and drops blanks', () => {
    expect(parseRecipients(' a@x.test, b@x.test;\n c@x.test ,, ')).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
  });
  it('removes repeats regardless of case but keeps the first spelling', () => {
    expect(parseRecipients('A@x.test, a@X.test, b@x.test')).toEqual(['A@x.test', 'b@x.test']);
  });
  it('returns an empty list for empty text', () => {
    expect(parseRecipients('   ')).toEqual([]);
  });
});

describe('invalidRecipients', () => {
  it('flags text that is not an address and passes real ones', () => {
    expect(invalidRecipients(['ok@x.test', 'nope', 'a@b', 'two@@x.test', 'sp ace@x.test'])).toEqual(['nope', 'a@b', 'two@@x.test', 'sp ace@x.test']);
  });
});

describe('formatBytes', () => {
  it('uses B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('buildSeed', () => {
  const recipients: MailRecipient[] = [
    { kind: 'to', address: 'me@mail.test' },
    { kind: 'to', address: 'Sam@mail.test' },
    { kind: 'cc', address: 'ruth@mail.test' },
    { kind: 'bcc', address: 'hidden@mail.test' },
  ];
  const source = { message_id: 'msg-1', from_address: 'ruth@mail.test', from_name: 'Ruth', subject: 'Rota', body_text: 'Line one\nLine two', recipients };
  const ctx = { me: 'ME@mail.test', date: '1 Nov', wroteOn: (who: string, date: string) => `On ${date}, ${who} wrote:`, forwardedHeader: '--- Forwarded ---' };

  it('replies to the sender only, threads on the original, and quotes every line', () => {
    const seed = buildSeed('reply', source, ctx);
    expect(seed).toMatchObject({ to: ['ruth@mail.test'], cc: [], bcc: [], subject: 'Re: Rota', inReplyTo: 'msg-1' });
    expect(seed.body).toContain('On 1 Nov, Ruth <ruth@mail.test> wrote:');
    expect(seed.body).toContain('> Line one\n> Line two');
  });

  it('does not stack Re: prefixes', () => {
    expect(buildSeed('reply', { ...source, subject: 're: Rota' }, ctx).subject).toBe('re: Rota');
  });

  it('reply all copies the other recipients but never me, the sender again, or any Bcc', () => {
    const seed = buildSeed('replyAll', source, ctx);
    expect(seed.to).toEqual(['ruth@mail.test']);
    expect(seed.cc).toEqual(['Sam@mail.test']);
    expect(seed.bcc).toEqual([]);
  });

  it('forward starts with no recipients, adds Fwd:, includes the original, and has no thread link', () => {
    const seed = buildSeed('forward', source, ctx);
    expect(seed).toMatchObject({ to: [], cc: [], bcc: [], subject: 'Fwd: Rota' });
    expect(seed.inReplyTo).toBeUndefined();
    expect(seed.body).toContain('--- Forwarded ---\nLine one\nLine two');
  });
});

describe('setting values', () => {
  it('shows lists comma separated and missing values as empty', () => {
    expect(displayValue('list', ['exe', 'bat'])).toBe('exe, bat');
    expect(displayValue('integer', undefined)).toBe('');
    expect(displayValue('string', 'x')).toBe('x');
  });
  it('turns typed text back into the right type', () => {
    expect(coerceSettingValue('integer', '25')).toBe(25);
    expect(coerceSettingValue('number', '0.5')).toBe(0.5);
    expect(coerceSettingValue('boolean', true)).toBe(true);
    expect(coerceSettingValue('list', 'exe, bat, ,')).toEqual(['exe', 'bat']);
    expect(coerceSettingValue('string', ' keep ')).toBe(' keep ');
  });
  it('refuses a number that is not a number instead of sending NaN', () => {
    expect(coerceSettingValue('integer', '')).toBeUndefined();
    expect(coerceSettingValue('number', 'abc')).toBeUndefined();
    expect(coerceSettingValue('number', '  ')).toBeUndefined();
  });
});
