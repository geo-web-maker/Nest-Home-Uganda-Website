import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiError, apiClient } from '../../../lib/api/client';
import { AgreementPublicPage } from './AgreementPublicPage';

function renderPage(path = '/a/7KQM-3XPD-9F2R-WT4H') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/a/:token" element={<AgreementPublicPage />} />
    <Route path="/agreement/:token" element={<AgreementPublicPage />} />
  </Routes></MemoryRouter>);
}
const linkError = (state: string, ref: string, status = 404) =>
  new ApiError(status, `link_${state}`, 'server text', { state, ref, link_id: ref.split('-')[1] ?? '', release: 'abc1234' });

afterEach(() => vi.restoreAllMocks());

describe('agreement link problem screens', () => {
  it('shows the expired screen with a support reference', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(linkError('expired', 'L5-9F2A1C', 410));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'This agreement link has expired' })).toBeInTheDocument();
    expect(screen.getByText(/^L5-9F2A1C-/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0787499988' })).toHaveAttribute('href', 'tel:0787499988');
  });

  it('tells a link that never existed apart from a mistyped one', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(linkError('not_found', 'L3-9F2A1C'));
    renderPage('/agreement/CUuidr2ZlULNhuWkvv34uREizVoQ3y89HnsXNdb6UdA');
    expect(await screen.findByRole('heading', { name: 'We could not find this agreement' })).toBeInTheDocument();
  });

  it('does not call a rate limit a bad link', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(429, 'rate_limited', 'Too many attempts'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Too many attempts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not call a network failure a bad link', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(0, 'network_error', 'Could not reach'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText(/^N1-/)).toBeInTheDocument();
  });
});
