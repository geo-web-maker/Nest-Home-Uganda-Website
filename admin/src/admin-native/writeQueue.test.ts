import { describe, expect, it } from 'vitest';
import { RULES } from './writeQueue';

const queueable = (m: string, p: string) => RULES.some((r) => r.method === m && r.re.test(p));
describe('offline write allow-list', () => {
  it('queues enquiry and application updates and notes', () => {
    expect(queueable('PATCH', '/admin/enquiries/e1')).toBe(true); expect(queueable('POST', '/admin/enquiries/e1/notes')).toBe(true);
    expect(queueable('PATCH', '/admin/applications/a1')).toBe(true); expect(queueable('POST', '/admin/applications/a1/notes')).toBe(true);
  });
  it('never queues care, safety, billing or user actions', () => {
    for (const [m, p] of [['POST', '/admin/care/alerts/1/acknowledge'], ['POST', '/admin/care/flags/1/resolve'], ['POST', '/admin/care/visits'], ['POST', '/admin/billing/invoices/1/payments'], ['POST', '/admin/users/1/reset-password']] as [string, string][]) expect(queueable(m, p)).toBe(false);
  });
});
