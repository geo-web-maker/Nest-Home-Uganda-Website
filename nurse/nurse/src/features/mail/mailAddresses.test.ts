import { describe, expect, it } from 'vitest';
import { invalidAddresses, parseAddresses, quoteBody, replySubject } from './mailAddresses';

describe('mail addresses', () => {
  it('splits, trims and removes repeats regardless of case', () => {
    expect(parseAddresses(' a@x.test, B@x.test;\n a@X.test ,, ')).toEqual(['a@x.test', 'B@x.test']);
    expect(parseAddresses('  ')).toEqual([]);
  });
  it('flags anything that is not an address', () => {
    expect(invalidAddresses(['ok@x.test', 'nope', 'a@b', 'x@@y.test'])).toEqual(['nope', 'a@b', 'x@@y.test']);
  });
  it('adds Re: once', () => {
    expect(replySubject('Rota')).toBe('Re: Rota');
    expect(replySubject('Rota')).not.toBe('Re: Re: Rota');
    expect(replySubject('re: Rota')).toBe('re: Rota');
  });
  it('quotes every line', () => {
    expect(quoteBody('a\nb')).toBe('> a\n> b');
  });
});
