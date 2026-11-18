import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/client';
import { VerifyBillingPanel } from './VerifyBillingPanel';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const hash = vi.hoisted(() => ({ sha256Hex: vi.fn() }));
vi.mock('../verify/hash', () => ({ sha256Hex: hash.sha256Hex }));
vi.mock('../../../lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/api/client')>();
  return { ...original, apiClient: api };
});

describe('VerifyBillingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = '';
    hash.sha256Hex.mockResolvedValue('b'.repeat(64));
  });

  const valid = {
    valid: true,
    status: 'valid',
    superseded: false,
    doc_type: 'invoice',
    reference: 'BHC-INV-2026-0001',
    practice: false,
    issued_on: '2026-11-13',
    amount_ugx: 410000,
    client_name: 'M*** A. N*****',
    voided_at: null,
    content_hash: 'a'.repeat(64),
    pdf_sha256: { ledger: 'b'.repeat(64), slip: 'c'.repeat(64) },
  } as const;

  it('shows a genuine and valid invoice and marks the page noindex', async () => {
    api.get.mockResolvedValue(valid);
    render(<VerifyBillingPanel reference={valid.reference} code="aaaaaaaaaaaaaaaa" />);
    expect(await screen.findByText('Genuine and valid document')).toBeTruthy();
    expect(screen.getByText('M*** A. N*****')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,nofollow',
    );
  });

  it('shows a genuine but void receipt', async () => {
    api.get.mockResolvedValue({
      ...valid,
      status: 'void',
      doc_type: 'receipt',
      voided_at: '2026-11-12T10:00:00Z',
    });
    render(<VerifyBillingPanel reference="BHC-RCT-2026-0001" code="aaaaaaaaaaaaaaaa" />);
    expect(await screen.findByText('Genuine document, but void')).toBeTruthy();
  });

  it('marks practice documents', async () => {
    api.get.mockResolvedValue({ ...valid, practice: true });
    render(<VerifyBillingPanel reference={valid.reference} code="aaaaaaaaaaaaaaaa" />);
    expect(
      await screen.findByText('Practice document. It is not a real invoice or receipt.'),
    ).toBeTruthy();
  });

  it('shows the neutral not-found message', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'not_found', 'No document matches this link.'));
    render(<VerifyBillingPanel reference="BHC-INV-2026-9999" code="aaaaaaaaaaaaaaaa" />);
    expect(await screen.findByText('We could not match this document')).toBeTruthy();
  });

  it('compares an uploaded PDF against the published sealed rendition hashes', async () => {
    api.get.mockResolvedValue(valid);
    render(<VerifyBillingPanel reference={valid.reference} code="aaaaaaaaaaaaaaaa" />);
    await screen.findByText('Genuine and valid document');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['sealed pdf'], 'invoice.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('billingVerify.identical')).toBeTruthy();
    expect(hash.sha256Hex).toHaveBeenCalledWith(file);
  });

  it('reports a PDF whose content hash differs from both published renditions', async () => {
    api.get.mockResolvedValue(valid);
    hash.sha256Hex.mockResolvedValue('d'.repeat(64));
    render(<VerifyBillingPanel reference={valid.reference} code="aaaaaaaaaaaaaaaa" />);
    await screen.findByText('Genuine and valid document');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['altered pdf'], 'changed.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('billingVerify.different')).toBeTruthy();
  });

  it('shows the retry-later state when public verification is rate limited', async () => {
    api.get.mockRejectedValue(new ApiError(429, 'rate_limited', 'Try again later.'));
    render(<VerifyBillingPanel reference={valid.reference} code="aaaaaaaaaaaaaaaa" />);
    expect(await screen.findByText('billingVerify.busy')).toBeTruthy();
  });
});
