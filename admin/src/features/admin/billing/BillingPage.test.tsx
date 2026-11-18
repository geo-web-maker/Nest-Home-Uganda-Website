import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPage } from './BillingPage';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), getBlob: vi.fn() }));
vi.mock('@shared/lib/api/client', () => ({ apiClient: api }));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { scopes: ['billing:read', 'billing:write', 'billing:void'], is_superadmin: false },
  }),
}));
// `t` must keep a stable identity across renders (as real i18next does); a fresh function each
// render would change `load`/`openInvoice` and re-run their effects forever.
const i18n = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => i18n }));

describe('BillingPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  });

  it('renders the billing list and opens a new invoice draft editor', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('billing.title')).toBeTruthy();
    fireEvent.click(screen.getByText('billing.newInvoice'));
    expect(screen.getByLabelText('billing.clientName')).toBeTruthy();
    expect(screen.getByText('billing.saveDraft')).toBeTruthy();
  });

  it('shows a client-side total preview while keeping the server authoritative', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('billing.newInvoice'));
    fireEvent.change(screen.getByLabelText('billing.clientName'), {
      target: { value: 'Mrs A Nakato' },
    });
    fireEvent.change(screen.getByLabelText('billing.description'), {
      target: { value: 'Home care' },
    });
    fireEvent.change(screen.getByLabelText('billing.unitPrice'), { target: { value: '410000' } });
    await waitFor(() => expect(screen.getByText(/UGX 410,000/)).toBeTruthy());
  });

  const agreement = {
    reference: 'BHC-2026-0007',
    status: 'completed',
    client_name: 'Sogi Ssegawa',
    client_email: 'sogi@example.com',
    client_phone: '0776085549',
    client_address: 'Matugga',
    patient_name: 'Mama Sogi',
    program: 'Nest Mama Program',
    service_start: '2026-11-14',
    service_end: '2026-11-20',
    payment_instructions: 'Account name: Bloomwell',
  };
  const draftReply = {
    id: 'inv1',
    status: 'draft',
    bill_to: { name: 'Sogi Ssegawa', address: '', phone: '', email: '' },
    items: [],
    total_ugx: 0,
    paid_ugx: 0,
    balance_ugx: 0,
    issue_date: '2026-11-14',
    due_date: '2026-11-14',
    payment_instructions: '',
    notes: '',
  };

  it('fills the client, care recipient and item dates from the chosen agreement', async () => {
    api.get.mockImplementation(async (path: string) =>
      path.includes('agreement-options')
        ? { items: [agreement] }
        : { items: [], total: 0, page: 1, page_size: 25 },
    );
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('billing.newInvoice'));
    const select = screen.getByLabelText('billing.agreementReference') as HTMLSelectElement;
    await waitFor(() => expect(select.querySelector('option[value="BHC-2026-0007"]')).toBeTruthy());
    fireEvent.change(select, { target: { value: 'BHC-2026-0007' } });
    expect((screen.getByLabelText('billing.clientName') as HTMLInputElement).value).toBe('Sogi Ssegawa');
    expect((screen.getByLabelText('billing.clientEmail') as HTMLInputElement).value).toBe('sogi@example.com');
    expect((screen.getByLabelText('billing.careRecipient') as HTMLInputElement).value).toBe('Mama Sogi');
    expect((screen.getByLabelText('billing.careProgram') as HTMLInputElement).value).toBe('Nest Mama Program');
    expect((screen.getByLabelText('billing.serviceFrom') as HTMLInputElement).value).toBe('2026-11-14');
    expect((screen.getByLabelText('billing.serviceTo') as HTMLInputElement).value).toBe('2026-11-20');
  });

  it('lets an item be a single date or a period and refuses a backwards period', async () => {
    api.post.mockResolvedValue(draftReply);
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('billing.newInvoice'));
    fireEvent.change(screen.getByLabelText('billing.clientName'), { target: { value: 'Sogi' } });
    fireEvent.change(screen.getByLabelText('billing.description'), { target: { value: 'Home care' } });
    fireEvent.change(screen.getByLabelText('billing.unitPrice'), { target: { value: '1000' } });
    expect(screen.queryByLabelText('billing.serviceDate')).toBeNull();

    fireEvent.change(screen.getByLabelText('billing.serviceDateType'), { target: { value: 'period' } });
    fireEvent.change(screen.getByLabelText('billing.serviceFrom'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('billing.serviceTo'), { target: { value: '2026-11-14' } });
    expect((screen.getByText('billing.saveDraft').closest('button') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('billing.serviceTo'), { target: { value: '2026-11-25' } });
    const save = screen.getByText('billing.saveDraft').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0]?.[1] as { items: Array<{ service_date_text: string }> };
    expect(body.items[0]?.service_date_text).toBe('2026-11-20 to 2026-11-25');
  });

  const receiptRow = {
    id: 'pay1',
    reference: 'BHC-RCT-2026-0001',
    invoice_reference: 'BHC-INV-2026-0001',
    status: 'valid',
    amount_ugx: 10000,
    method: 'mtn_momo',
    paid_on: '2026-11-14',
    balance_after_ugx: 190000,
  };
  const mockReceipts = () =>
    api.get.mockImplementation(async (path: string) =>
      path === '/mail/totp/status'
        ? { enabled: true, verified: true }
        : { items: [receiptRow], total: 1, page: 1, page_size: 25 },
    );

  it('has one Download button per receipt that opens a pop-up of options', async () => {
    mockReceipts();
    api.getBlob.mockResolvedValue(new Blob(['x']));
    render(
      <MemoryRouter initialEntries={['/billing/receipts']}>
        <BillingPage />
      </MemoryRouter>,
    );
    const download = await screen.findByText('billing.download');
    expect(screen.queryByText('billing.slip')).toBeNull();
    fireEvent.click(download);
    expect(screen.getByText('billing.downloadTitle')).toBeTruthy();
    expect(screen.getByText('billing.ledger')).toBeTruthy();
    expect(screen.getByText('billing.copyWhatsApp')).toBeTruthy();
    fireEvent.click(screen.getByText('billing.slip'));
    await waitFor(() =>
      expect(api.getBlob).toHaveBeenCalledWith('/admin/billing/payments/pay1/pdf?layout=slip'),
    );
    expect(screen.queryByText('billing.downloadTitle')).toBeNull();
  });

  it('deletes a receipt with a reason through the delete dialog', async () => {
    mockReceipts();
    api.post.mockResolvedValue({ deleted: true, reference: 'BHC-RCT-2026-0001' });
    render(
      <MemoryRouter initialEntries={['/billing/receipts']}>
        <BillingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('billing.deleteRecord'));
    expect(screen.getByText('billing.deleteReceiptTitle')).toBeTruthy();
    const confirm = (await screen.findByText('billing.confirmDelete')).closest(
      'button',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('billing.deleteReason'), {
      target: { value: 'Entered on the wrong invoice' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/billing/payments/pay1/delete', {
        reason: 'Entered on the wrong invoice',
      }),
    );
  });

  it('applies status, date and practice filters to the server query', async () => {
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'billing.statuses.issued' }));
    fireEvent.change(screen.getByLabelText('billing.fromDate'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('billing.toDate'), {
      target: { value: '2026-11-18' },
    });
    fireEvent.click(screen.getByLabelText('billing.includePractice'));

    await waitFor(() => {
      const calls = api.get.mock.calls.filter((call) => call[0] === '/admin/billing/invoices');
      expect(calls.at(-1)?.[1]).toEqual({
        params: {
          q: undefined,
          status: 'issued',
          from: '2026-11-01',
          to: '2026-11-18',
          include_test: true,
          page: 1,
          page_size: 25,
        },
      });
    });
  });

  it('keeps the same idempotency key when a payment request is retried', async () => {
    const invoice = {
      id: 'inv-1',
      reference: 'BHC-INV-2026-0001',
      status: 'issued',
      bill_to: { name: 'Amina N.', address: '', phone: '', email: '' },
      items: [{ description: 'Home care', quantity: 1, unit_price_ugx: 200000 }],
      total_ugx: 200000,
      paid_ugx: 0,
      balance_ugx: 200000,
      issue_date: '2026-11-14',
      due_date: '2026-11-18',
      payment_instructions: '',
      notes: '',
      payments: [],
      sealed: { content_hash: 'a'.repeat(64) },
    };
    api.get.mockImplementation(async (path: string) =>
      path === '/admin/billing/invoices/inv-1'
        ? invoice
        : { items: [], total: 0, page: 1, page_size: 25 },
    );
    api.post.mockRejectedValueOnce(new Error('Temporary payment service failure'));
    api.post.mockResolvedValueOnce({ id: 'pay-1' });
    vi.stubGlobal('crypto', { randomUUID: () => 'retry-key-0001' });
    render(
      <MemoryRouter initialEntries={['/billing?invoice=inv-1']}>
        <BillingPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('billing.recordPayment'));
    fireEvent.change(screen.getByLabelText('billing.payerReference'), {
      target: { value: 'MOMO-12345' },
    });
    const submit = screen.getByRole('button', { name: 'billing.submitPayment' });
    fireEvent.click(submit);
    await screen.findByText('Temporary payment service failure');
    const firstRequest = api.post.mock.calls[0]?.[1] as { idempotency_key: string };
    expect(firstRequest.idempotency_key).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'billing.submitPayment' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const retryRequest = api.post.mock.calls[1]?.[1] as { idempotency_key: string };
    expect(retryRequest.idempotency_key).toBe(firstRequest.idempotency_key);
  });
});
