import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { RouteErrorPage } from './RouteErrorPage';

vi.mock('../lib/api/clientErrors', () => ({ reportClientError: vi.fn() }));

function renderWith(loader: () => never) {
  const router = createMemoryRouter([{ path: '/', loader, element: <p>ok</p>, ErrorBoundary: RouteErrorPage }]);
  render(<RouterProvider router={router} />);
}

describe('RouteErrorPage', () => {
  it('shows a friendly not-found page with a way home for a 404', async () => {
    renderWith(() => { throw new Response('', { status: 404 }); });
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('shows a server-problem page with a reference and retry for a 500', async () => {
    renderWith(() => { throw new Response('', { status: 503 }); });
    expect(await screen.findByRole('heading', { level: 1, name: 'We are having a problem on our side' })).toBeInTheDocument();
    expect(screen.getByText(/Reference/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('never shows the raw router error for a thrown exception', async () => {
    renderWith(() => { throw new Error('boom'); });
    expect(await screen.findByRole('heading', { level: 1, name: 'We are having a problem on our side' })).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
