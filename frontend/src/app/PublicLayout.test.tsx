import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { Root } from './Root';
import { PublicLayout } from './PublicLayout';

vi.mock('../lib/queries/services', () => ({ useServices: () => ({ data: [] }) }));

function setup() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Root />}>
          <Route element={<PublicLayout />}>
            <Route index element={<Link to="/next">next</Link>} />
            <Route path="next" element={<p>next page</p>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicLayout', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it('renders header, a focusable main, footer and the sticky bar', () => {
    setup();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call now' })).toBeInTheDocument();
  });

  it('has a skip link that moves focus to main', async () => {
    setup();
    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('does not steal focus or scroll on the first render', () => {
    setup();
    expect(screen.getByRole('main')).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top and focuses main after a route change', async () => {
    setup();
    await userEvent.click(screen.getByRole('link', { name: 'next' }));
    expect(screen.getByText('next page')).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
