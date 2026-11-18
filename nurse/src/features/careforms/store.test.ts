import { describe, expect, it } from 'vitest';
import { applyLocal, overlayPending, type Bootstrap, type SubmitPayload } from './store';
import { summarise } from './HomeSummaryCard';

const boot: Bootstrap = { auto_email_copy: false, gates_enabled: true, clients: [{ id: 'c1', display_name: 'Mary K', patient_type: 'Baby' }], documents: [] };
const p = (extra: Partial<SubmitPayload> = {}): SubmitPayload => ({ op_id: 'op-00000001', form_id: '03', client_id: 'c1', visit_id: null, data: { a: 1 }, ...extra });

describe('optimistic local state', () => {
  it('a client signature makes the form pending, a countersign makes it signed', () => {
    const a = applyLocal(boot, p({ client_signature: { role: 'client', method: 'drawn', name: 'M', detail: {}, evidence: {}, esign_consent: true } }));
    expect(a.documents[0].status).toBe('pending');
    const b = applyLocal(a, p({ op_id: 'op-00000002', nurse_signature: { method: 'drawn', evidence: {} } }));
    expect(b.documents).toHaveLength(1); expect(b.documents[0].status).toBe('signed'); expect(b.documents[0].queued).toBe(true);
  });
  it('a signed form is never overwritten by a later draft; the correction becomes a new row', () => {
    const signed = applyLocal(boot, p({ nurse_signature: { method: 'drawn', evidence: {} } }));
    expect(applyLocal(signed, p({ op_id: 'op-00000003' })).documents).toHaveLength(2);
  });
  it('trackers are separate per week', () => {
    const w1 = applyLocal(boot, p({ form_id: 'tracker', data: { week_start: '2026-11-09' } }));
    expect(applyLocal(w1, p({ op_id: 'op-00000004', form_id: 'tracker', data: { week_start: '2026-11-16' } })).documents).toHaveLength(2);
  });
  it('Form 08 keeps the supervisor orders when administrations are saved', () => {
    const seeded: Bootstrap = { ...boot, documents: [{ id: 'd1', form_id: '08', client_id: 'c1', status: 'draft', version: 1, data: { orders: { medicine_name: 'X' } } }] };
    const out = applyLocal(seeded, p({ form_id: '08', data: { administrations: [{ given: true }] } }));
    expect(out.documents[0].data).toMatchObject({ orders: { medicine_name: 'X' }, administrations: [{ given: true }] });
  });
  it('overlays queued operations in creation order', () => {
    const out = overlayPending(boot, [{ createdAt: '2', payload: p({ op_id: 'op-00000009', nurse_signature: { method: 'drawn', evidence: {} } }) as never }, { createdAt: '1', payload: p() as never }]);
    expect(out.documents[0].status).toBe('signed');
  });
});
describe('home summary', () => {
  const care = (docs: Bootstrap['documents']) => ({ boot, docsFor: () => docs, typeOf: () => 'Baby', signedIds: () => docs.filter((d) => d.status === 'signed').map((d) => d.form_id) });
  const visit = { client_id: 'c1', client_display_name: 'Mary K', status: 'scheduled' as const, scheduled_start: '2026-11-18T08:00:00Z' };
  it('flags Form 03 and the tracker as due today and names no health detail', () => {
    const s = summarise(care([]), [visit], '2026-11-18');
    expect(s.dueToday).toBe(2); expect(s.urgent).toBe('Form 03 needed for Mary K');
  });
  it('puts a pending countersign first and counts signed forms this week', () => {
    const docs: Bootstrap['documents'] = [{ id: 'd1', form_id: '03', client_id: 'c1', status: 'pending', version: 1, data: {} }, { id: 'd2', form_id: '02', client_id: 'c1', status: 'signed', version: 1, signed_at: '2026-11-17T10:00:00Z', data: {} }];
    const s = summarise(care(docs), [visit], '2026-11-18');
    expect(s.needsSignature).toBe(1); expect(s.signedThisWeek).toBe(1); expect(s.urgent).toMatch(/^Countersign Form 03/);
  });
});
