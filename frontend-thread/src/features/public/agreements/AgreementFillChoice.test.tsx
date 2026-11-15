import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { apiClient } from '../../../lib/api/client';
import { AgreementPublicPage } from './AgreementPublicPage';

const field = (value: string) => ({ value, owner: 'client', revision: 1, entered_by_staff: false });
const base = { company: 'Bloomwell', reference: 'BHC-2026-0012', status: 'client_in_progress', template_version: 3, clauses: { '1': 'Text' }, document_html: null,
  fields: { 'client.name': field('Pat') }, schedule_b_computed: {}, content_hash: 'h', signed: false };
const pre = { company: 'Bloomwell', message: '', available_channels: { sms: true, email: true }, purpose: 'sign' };

function open() {
  render(<MemoryRouter initialEntries={['/a/TOKEN']}><Routes><Route path="/a/:token" element={<AgreementPublicPage />} /></Routes></MemoryRouter>);
}
afterEach(() => vi.restoreAllMocks());

describe('after verifying: fill in myself or ask Bloomwell', () => {
  it('offers both choices and hides signing until one is made', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => (path.endsWith('/session') ? { ...base, fill_mode: null, assistance: { state: 'none' } } : pre) as never);
    open();
    expect(await screen.findByRole('button', { name: /I will fill it in myself/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask Bloomwell to fill it in for me/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit my signature/ })).not.toBeInTheDocument();
  });

  it('sends an assistance request and shows the waiting screen', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => (path.endsWith('/session') ? { ...base, fill_mode: null, assistance: { state: 'none' } } : pre) as never);
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ ...base, fill_mode: 'assisted', assistance: { state: 'requested' } } as never);
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Ask Bloomwell to fill it in for me/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send my request' }));
    expect(post).toHaveBeenCalledWith('/public/agreements/session/fill-mode', { mode: 'assisted' });
    expect(await screen.findByText('Bloomwell is filling in your details')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit my signature/ })).not.toBeInTheDocument();
  });

  it('goes straight to the form when the client already chose to fill it in', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => (path.endsWith('/session') ? { ...base, fill_mode: 'self', assistance: { state: 'none' } } : pre) as never);
    open();
    expect(await screen.findByRole('button', { name: /Submit my signature/ })).toBeInTheDocument();
  });
});
