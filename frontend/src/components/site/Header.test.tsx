import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { act, render, screen, within } from '@testing-library/react';
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
      ['How it works', '/how-it-works'],
      ['FAQ', '/faq'],
      ['Contact', '/contact'],
    ] as const) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getByRole('link', { name: /Well Nest Home Care/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+256787499988');
  });

  it('groups About, Team, Areas and Careers under an About menu', () => {
    const { nav } = setup();
    const trigger = within(nav).getByRole('button', { name: 'About' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'about-menu');
    for (const [name, href] of [
      ['About', '/about'],
      ['Team', '/team'],
      ['Areas', '/areas'],
      ['Careers', '/careers'],
    ] as const) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    // Grouped pages are no longer top-level links.
    expect(document.querySelector('#site-nav > ul > li > a[href="/team"]')).toBeNull();
    expect(document.querySelector('#site-nav > ul > li > a[href="/careers"]')).toBeNull();
  });

  it('expands the About menu on click and keeps only one menu open at a time', async () => {
    setup();
    const about = screen.getByRole('button', { name: 'About' });
    const services = screen.getByRole('button', { name: 'Services' });
    await userEvent.click(services);
    expect(services).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(about);
    expect(about).toHaveAttribute('aria-expanded', 'true');
    expect(services).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(about);
    expect(about).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the About menu with the keyboard and closes it on Escape', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'About' });
    act(() => trigger.focus());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('marks a grouped page as current on its link', () => {
    const { nav } = setup('/careers');
    expect(within(nav).getByRole('link', { name: 'Careers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'About' })).toHaveAttribute(
      'data-group-current',
      'true',
    );
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
    expect(within(nav).getByRole('link', { name: 'Contact' })).not.toHaveAttribute('aria-current');
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
    await userEvent.tab(); // Home
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
