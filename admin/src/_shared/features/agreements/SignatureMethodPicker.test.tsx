/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { describe, expect, it } from 'vitest';
import { credentialProblem, signatureMethodLabel } from './SignatureMethodPicker';

describe('credentialProblem', () => {
  it('needs nothing for drawn or biometric signatures', () => {
    expect(credentialProblem('drawn', 'client', '', '')).toBeNull();
    expect(credentialProblem('biometric', 'staff', '', '')).toBeNull();
  });
  it('requires a long enough matching passphrase for clients', () => {
    expect(credentialProblem('password', 'client', 'short', 'short')).toMatch(/at least 8/);
    expect(credentialProblem('password', 'client', 'longenough1', 'different1')).toMatch(/do not match/);
    expect(credentialProblem('password', 'client', 'longenough1', 'longenough1')).toBeNull();
  });
  it('only needs the account password once for staff', () => {
    expect(credentialProblem('password', 'staff', '', '')).toMatch(/account password/);
    expect(credentialProblem('password', 'staff', 'Account-pass1', '')).toBeNull();
  });
});

describe('signatureMethodLabel', () => {
  it('names every method readably', () => {
    expect(signatureMethodLabel('biometric')).toBe('Device passkey (biometric or screen lock)');
    expect(signatureMethodLabel('drawn')).toBe('Drawn signature');
    expect(signatureMethodLabel('password', 'client')).toBe('Passphrase set by signer');
    expect(signatureMethodLabel('password', 'bloomwell')).toBe('Account password verified');
    expect(signatureMethodLabel('something_new')).toBe('something new');
  });
});
