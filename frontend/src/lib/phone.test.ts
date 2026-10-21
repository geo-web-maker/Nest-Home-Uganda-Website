import { formatUgPhone, isValidUgPhone, normaliseUgPhone } from './phone';

describe('normaliseUgPhone', () => {
  it.each(['0787 499 988', '0787499988', '+256 787 499 988', '256787499988', '0787-499-988'])(
    'accepts %s',
    (raw) => {
      expect(normaliseUgPhone(raw)).toBe('+256787499988');
    },
  );

  it('accepts a landline but gives the same shape', () => {
    expect(normaliseUgPhone('0312 345 678')).toBe('+256312345678');
  });

  it.each(['', '123', '0187499988', '+254787499988', '07874999', 'abc'])('refuses %s', (raw) => {
    expect(normaliseUgPhone(raw)).toBeNull();
    expect(isValidUgPhone(raw)).toBe(false);
  });
});

describe('formatUgPhone', () => {
  it('shows a Uganda number in local grouped form', () => {
    expect(formatUgPhone('+256787499988')).toBe('0787 499 988');
  });

  it('returns anything else unchanged', () => {
    expect(formatUgPhone('+254787499988')).toBe('+254787499988');
    expect(formatUgPhone('abc')).toBe('abc');
  });
});
