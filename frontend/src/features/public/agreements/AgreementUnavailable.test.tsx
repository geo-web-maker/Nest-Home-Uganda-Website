import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiError, apiClient } from '../../../lib/api/client';
import { AgreementPublicPage } from './AgreementPublicPage';

function renderPage() {
  render(<MemoryRouter initialEntries={['/agreement/abc']}><Routes><Route path="/agreement/:token" element={<AgreementPublicPage />} /></Routes></MemoryRouter>);
}

afterEach(() => vi.restoreAllMocks());

describe('agreement link unavailable screen', () => {
  it('tells the client to use the newest message when the link was replaced', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(404, 'not_found', 'This agreement link is no longer active'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Agreement link unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/most recent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0787499988' })).toHaveAttribute('href', 'tel:0787499988');
  });

  it('says the link expired when it did', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(404, 'not_found', 'This agreement link has expired'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'This agreement link has expired' })).toBeInTheDocument();
  });

  it('offers Try again when the server cannot be reached', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
