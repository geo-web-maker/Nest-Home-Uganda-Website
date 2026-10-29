import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';

// Head is mocked in test-setup.ts. These tests check page structure only. Title and description are proven on the real build output
// (raw HTML grep, see docs/BUILD_LOG.md).

vi.mock('../lib/queries/services', () => ({
  useServices: () => ({ data: [] }),
  useService: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
}));
vi.mock('../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/client')>();
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn(() => new Promise(() => {})) } };
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('public routes', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it('renders one h1 on the home route', () => {
    renderAt('/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Care that comes home to you.',
    );
  });

  it('renders one h1 on the services route', () => {
    renderAt('/services');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Eight kinds of care, one trusted team.',
    );
  });
});

describe('registered public routes', () => {
  it.each([
    ['/about', 'Care that treats your family as ours.'],
    ['/team', 'Faces you can trust at your door.'],
    ['/how-it-works', 'Clear steps, clear pricing.'],
    ['/areas', 'Home visits across Kampala and surrounds.'],
    ['/faq', 'Answers to common questions.'],
    ['/privacy', 'Privacy and terms.'],
    ['/careers', 'Join the team.'],
    ['/contact', 'Talk to us today.'],
  ])('renders %s with its own h1', (path, title) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it.each(['/services/postnatal-newborn-care', '/faq/care-guide', '/careers/abc'])(
    'matches the dynamic route %s instead of the 404 page',
    (path) => {
      renderAt(path);
      expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
    },
  );
});

describe('layout and 404', () => {
  it('wraps public pages in the layout with a main landmark', () => {
    renderAt('/');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('shows the 404 page inside the layout for an unknown path', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

describe('design route', () => {
  it('shows the component showcase in development and test builds', async () => {
    renderAt('/design');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Design system/ }),
    ).toBeInTheDocument();
  });
});

describe('admin routes', () => {
  it('shows the login screen outside the public layout', async () => {
    renderAt('/admin/login');
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  }, 15000);

  it('sends a signed-out visitor from an admin page to the login screen', async () => {
    renderAt('/admin/enquiries');
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }, { timeout: 10000 }),
    ).toBeInTheDocument();
  }, 15000);
});
