import { describe, expect, it } from 'vitest';
import { RULES } from './writeQueue';

const queueable = (m: string, p: string) => RULES.some((r) => r.method === m && r.re.test(p));
describe('offline write allow-list', () => {
  it('queues enquiry and application updates and notes', () => {
    expect(queueable('PATCH', '/admin/enquiries/e1')).toBe(true); expect(queueable('POST', '/admin/enquiries/e1/notes')).toBe(true);
    expect(queueable('PATCH', '/admin/applications/a1')).toBe(true); expect(queueable('POST', '/admin/applications/a1/notes')).toBe(true);
  });
  it('queues care acknowledge, resolve, approve and scheduling', () => {
    const allowed: Array<[string, string]> = [
      ['POST', '/admin/care/alerts/1/acknowledge'],
      ['POST', '/admin/care/alerts/1/resolve'],
      ['POST', '/admin/care/sos/1/acknowledge'],
      ['POST', '/admin/care/flags/1/resolve'],
      ['POST', '/admin/care/timesheets/1/approve'],
      ['POST', '/admin/care/timesheets/1/send-back'],
      ['PATCH', '/admin/care/visits/1'],
      ['POST', '/admin/care/visits'],
      ['POST', '/admin/care/clients'],
      ['POST', '/admin/care/clients/1/places'],
      ['POST', '/admin/care/clients/1/stays'],
    ];
    for (const [method, path] of allowed) expect(queueable(method, path)).toBe(true);
  });
  it('never queues billing, deletes, device revokes or user actions', () => {
    const denied: Array<[string, string]> = [
      ['POST', '/admin/billing/invoices/1/payments'],
      ['POST', '/admin/users/1/reset-password'],
      ['DELETE', '/admin/care/clients/1'],
      ['POST', '/admin/care/nurses/1/revoke-device'],
    ];
    for (const [method, path] of denied) expect(queueable(method, path)).toBe(false);
  });
});
