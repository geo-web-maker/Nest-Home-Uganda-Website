import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Header } from './Header';

function Go() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate('/about')}>go</button>;
}

function setup(initialEntry = '/') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Header />
        <Routes><Route path="*" element={<Go />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    nav: screen.getByRole('navigation', { name: 'Main' }),
    menuButton: screen.getByRole('button', { name: 'Menu' }),
  };
}

describe('Thread Header', () => {
  it('shows the primary links in the approved order and keeps a live phone link', () => {
    const { nav } = setup();
    const names = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(names).toEqual(['Services', 'How it works', 'About us', 'FAQ', 'Contact']);
    expect(screen.getByRole('link', { name: /Bloomwell Home Care/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+256787499988');
  });

  it('marks a service detail route as the current Services destination', () => {
    const { nav } = setup('/services/postnatal-care');
    expect(within(nav).getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
  });

  it('toggles the mobile menu, closes with Escape and returns focus', async () => {
    const { nav, menuButton } = setup();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveAttribute('data-open', 'true');
    await userEvent.keyboard('{Escape}');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveFocus();
  });

  it('closes the menu after route change', async () => {
    const { menuButton } = setup();
    await userEvent.click(menuButton);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
