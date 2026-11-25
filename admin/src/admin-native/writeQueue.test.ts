import { describe, expect, it } from 'vitest';
import { RULES } from './writeQueue';

const queueable = (m: string, p: string) => RULES.some((r) => r.method === m && r.re.test(p));
describe('offline write allow-list', () => {
  it('queues enquiry and application updates and notes', () => {
    expect(queueable('PATCH', '/admin/enquiries/e1')).toBe(true); expect(queueable('POST', '/admin/enquiries/e1/notes')).toBe(true);
    expect(queueable('PATCH', '/admin/applications/a1')).toBe(true); expect(queueable('POST', '/admin/applications/a1/notes')).toBe(true);
  });
  it('queues care acknowledge, resolve, approve and scheduling', () => {
    for (const [m = '', p = ''] of [['POST', '/admin/care/timesheets/1/approve']]) expect(queueable(m, p)).toBe(true);
  });
  it('never queues billing, deletes, device revokes or user actions', () => {
    for (const [m = '', p = ''] of [['POST', '/admin/billing/invoices/1/payments'], ['POST', '/admin/users/1/reset-password'], ['DELETE', '/admin/care/clients/1'], ['POST', '/admin/care/nurses/1/revoke-device']]) expect(queueable(m, p)).toBe(false);
  });
});
