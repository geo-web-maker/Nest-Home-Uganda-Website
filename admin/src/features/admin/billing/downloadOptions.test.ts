import { describe, expect, it } from 'vitest';
import { billingBase, canDeleteRecord, downloadOptions } from './downloadOptions';

describe('downloadOptions', () => {
  it('offers A4, 80 mm and WhatsApp for a live invoice', () => {
    const options = downloadOptions('invoice', { id: 'i1', reference: 'BHC-INV-2026-0001', status: 'issued' });
    expect(options.map((o) => o.labelKey)).toEqual([
      'billing.ledger',
      'billing.slip',
      'billing.copyWhatsApp',
    ]);
    expect(options[0]).toMatchObject({
      path: '/admin/billing/invoices/i1/pdf?layout=ledger',
      filename: 'BHC-INV-2026-0001-ledger.pdf',
    });
  });

  it('offers the VOID copy and both originals for a void document', () => {
    const options = downloadOptions('invoice', { id: 'i1', reference: 'R1', status: 'void' });
    expect(options.map((o) => o.labelKey)).toEqual([
      'billing.downloadVoid',
      'billing.originalLedger',
      'billing.originalSlip',
      'billing.copyWhatsApp',
    ]);
    expect(options[1]).toMatchObject({ path: expect.stringContaining('original=true') });
  });

  it('uses the receipt wording and payments path for receipts', () => {
    const options = downloadOptions('receipt', { id: 'p1', reference: 'R2', status: 'void' });
    expect(options[1]).toMatchObject({ labelKey: 'billing.originalReceipt' });
    expect(billingBase('receipt', 'p1')).toBe('/admin/billing/payments/p1');
    expect(options.at(-1)).toMatchObject({ path: '/admin/billing/payments/p1/whatsapp' });
  });

  it('decides what can be deleted', () => {
    expect(canDeleteRecord('invoice', 'draft')).toBe(false);
    expect(canDeleteRecord('invoice', 'paid')).toBe(false);
    expect(canDeleteRecord('invoice', 'issued')).toBe(true);
    expect(canDeleteRecord('invoice', 'void')).toBe(true);
    expect(canDeleteRecord('receipt', 'valid')).toBe(true);
  });
});
