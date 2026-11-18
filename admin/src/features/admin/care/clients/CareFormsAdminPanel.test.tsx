import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@shared/lib/api/client';
import { CareFormsAdminPanel } from './CareFormsAdminPanel';

vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(), getBlob: vi.fn() } };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ items: [{
    id: 'form-instance-001', form_id: '03', status: 'signed', version: 2,
    signed_at: '2026-11-17T09:00:00Z', document_hash: 'abc123',
    signatures: [{ role: 'client', name: 'Amina N.', method: 'drawn', signed_at: '2026-11-17T08:55:00Z' }],
  }, { id: 'form-instance-002', form_id: '04', status: 'draft', version: 1, signatures: [] }] } as never);
});

describe('CareFormsAdminPanel', () => {
  it('shows document metadata and signature evidence without an edit action', async () => {
    render(<CareFormsAdminPanel clientId="client-000001" />);
    expect(await screen.findByText('Form 03')).toBeInTheDocument();
    expect(screen.getByText(/Amina N\./)).toBeInTheDocument();
    const pdfButtons = screen.getAllByRole('button', { name: 'View signed PDF' });
    expect(pdfButtons).toHaveLength(2);
    expect(pdfButtons[0]).toBeEnabled();
    expect(pdfButtons[1]).toBeDisabled();
    expect(screen.queryByRole('button', { name: /edit|delete|correct/i })).not.toBeInTheDocument();
  });
});
