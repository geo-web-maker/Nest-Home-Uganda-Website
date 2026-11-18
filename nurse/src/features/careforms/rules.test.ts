import { describe, expect, it } from 'vitest';
import { FORM_DEFS } from './formDefs';
import { abnormalTemp, administrationProblem, arriveBlocked, clientSigningProblem, copyHint, formsForGroup, nurseSigningProblem, scopeVisitId, tempNeedsAction, trackerAllowed, unmcProblem, weekStartOf } from './rules';

const base = { role: 'client', method: 'drawn', name: 'Mary', esign: true, hasImage: true };
describe('gates (rule 9)', () => {
  it('blocks Arrive until Form 03 is signed, only when gates are on', () => {
    expect(arriveBlocked(true, ['01'])).toBe(true);
    expect(arriveBlocked(true, ['03'])).toBe(false);
    expect(arriveBlocked(false, [])).toBe(false);
  });
  it('flags abnormal temperature and needs an action unless Form 10 exists', () => {
    expect(abnormalTemp('37.6')).toBe(true); expect(abnormalTemp('37.5')).toBe(false);
    expect(abnormalTemp('36.2')).toBe(false); expect(abnormalTemp('36.2', true)).toBe(true);
    expect(tempNeedsAction('38', '')).toBe(true); expect(tempNeedsAction('38', 'Called supervisor')).toBe(false); expect(tempNeedsAction('38', '', true)).toBe(false);
  });
  it('Form 08 needs a reason for a dose not given', () => {
    expect(administrationProblem({ given: false })).toMatch(/reason/); expect(administrationProblem({ given: false, reason: 'refused' })).toBeNull(); expect(administrationProblem({ given: true })).toBeNull();
  });
});
describe('patient type (rule 4)', () => {
  it('shows the tracker group only for Mama and Baby', () => {
    expect(trackerAllowed('Mama')).toBe(true); expect(trackerAllowed('Baby')).toBe(true); expect(trackerAllowed('General')).toBe(false);
    expect(formsForGroup(['tracker'], 'General')).toEqual([]); expect(formsForGroup(['tracker'], 'Baby')).toEqual(['tracker']);
  });
});
describe('client signing roles and methods (rule 2)', () => {
  it('accepts a drawn client signature and requires the e-sign tick', () => {
    expect(clientSigningProblem(base)).toBeNull(); expect(clientSigningProblem({ ...base, esign: false })).toMatch(/electronically/);
  });
  it('requires authority for a representative', () => {
    expect(clientSigningProblem({ ...base, role: 'representative' })).toMatch(/authority/); expect(clientSigningProblem({ ...base, role: 'representative', authority: 'Parent' })).toBeNull();
  });
  it('requires an 8+ character passphrase entered twice', () => {
    const p = { ...base, method: 'password', hasImage: false };
    expect(clientSigningProblem({ ...p, passphrase: 'short', confirm: 'short' })).toMatch(/8/);
    expect(clientSigningProblem({ ...p, passphrase: 'longenough', confirm: 'different1' })).toMatch(/match/);
    expect(clientSigningProblem({ ...p, passphrase: 'longenough', confirm: 'longenough' })).toBeNull();
  });
  it('thumbprint needs the interpreter name, address, language and signature', () => {
    const t = { ...base, method: 'thumbprint' };
    expect(clientSigningProblem(t)).toMatch(/interpreter/);
    expect(clientSigningProblem({ ...t, interpreter: { name: 'I', address: 'A', language: 'Luganda', signed: true } })).toBeNull();
  });
  it('nurse account password needs a connection', () => {
    expect(nurseSigningProblem('password', false, 'x', false)).toMatch(/connection/); expect(nurseSigningProblem('password', false, 'x', true)).toBeNull(); expect(nurseSigningProblem('drawn', false, '', true)).toMatch(/drawn/);
  });
});
describe('UNMC (rule 6)', () => {
  it('prompts when the number is missing or the licence expired', () => {
    expect(unmcProblem(null)?.code).toBe('missing');
    expect(unmcProblem({ unmc_number: 'A1', unmc_licence_expiry: '2020-01-01' }, '2026-11-18')?.code).toBe('expired');
    expect(unmcProblem({ unmc_number: 'A1', unmc_licence_expiry: '2027-01-01' }, '2026-11-18')).toBeNull();
    expect(unmcProblem({ unmc_number: 'A1' })?.message).toMatch(/expiry date/);
  });
});
describe('copy (rule 7)', () => {
  it('never offers email when the admin switch is off', () => { expect(copyHint(false, true)).toMatch(/paper/); expect(copyHint(true, false)).toMatch(/agrees/); expect(copyHint(true, true)).toMatch(/emailed/); });
});
describe('helpers and definitions', () => {
  it('tracker weeks start on Monday', () => { expect(weekStartOf('2026-11-18')).toBe('2026-11-16'); expect(weekStartOf('2026-11-16')).toBe('2026-11-16'); expect(weekStartOf('2026-11-22')).toBe('2026-11-16'); });
  it('only 07, 09 and 10 are tied to a visit', () => { expect(scopeVisitId('03', 'v1')).toBeNull(); expect(scopeVisitId('10', 'v1')).toBe('v1'); });
  it('has the 12 forms with keys that match the backend slug rule', () => {
    expect(FORM_DEFS.map((f) => f.id)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    const keys = FORM_DEFS.flatMap((f) => f.items.flatMap((i) => (i.t === 'W' || i.t === 'C' ? [i.key] : i.t === 'F' ? i.fields.map((x) => x.key) : [])));
    expect(keys.every((k) => /^[a-z0-9_]{1,40}$/.test(k))).toBe(true);
    expect(keys).toContain('temperature_c');
  });
});
