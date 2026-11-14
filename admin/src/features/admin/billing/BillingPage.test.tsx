import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
