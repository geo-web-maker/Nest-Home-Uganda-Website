import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Header } from './Header';

vi.mock('../../lib/queries/services', () => ({
  useServices: () => ({
    data: [
      { id: '1', slug: 'elderly-care', name: 'Elderly care' },
      { id: '2', slug: 'postnatal-care', name: 'Postnatal care' },
    ],
  }),
}));

function Go() {
  const navigate = useNavigate();
  return <button onClick={() => void navigate('/about')}>go</button>;
}

function setup(initialEntry = '/') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Header />
        <Routes>
          <Route path="*" element={<Go />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const nav = screen.getByRole('navigation', { name: 'Main' });
  return { nav, menuButton: screen.getByRole('button', { name: 'Menu' }) };
}

describe('Header', () => {
  it('has the main nav links, the logo link home and a tel Call button', () => {
    const { nav } = setup();
    for (const [name, href] of [
      ['About', '/about'],
      ['How it works', '/how-it-works'],
      ['Careers', '/careers'],
      ['Contact', '/contact'],
    ] as const) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getByRole('link', { name: /Nest Home Care/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+256787499988');
  });

  it('lists the services in the dropdown with a link to each', () => {
    const { nav } = setup();
    expect(within(nav).getByRole('link', { name: 'Elderly care' })).toHaveAttribute(
      'href',
      '/services/elderly-care',
    );
    expect(within(nav).getByRole('link', { name: 'Postnatal care' })).toBeInTheDocument();
  });

  it('marks the current navigation destination', () => {
    const { nav } = setup('/about');
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Contact' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('toggles the phone menu and closes it on Escape and on route change', async () => {
    const { nav, menuButton } = setup();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveAttribute('data-open', 'true');
    await userEvent.keyboard('{Escape}');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menuButton);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the Services dropdown with the keyboard and closes it on Escape', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Services' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.tab(); // logo
    await userEvent.tab(); // Services trigger
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('opens on click, and a second click closes it', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Services' });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the dropdown when focus leaves it', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Services' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
