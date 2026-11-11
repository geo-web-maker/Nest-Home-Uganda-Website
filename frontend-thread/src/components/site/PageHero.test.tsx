import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHero } from './PageHero';

const CRUMBS = [{ label: 'Home', to: '/' }, { label: 'Services' }];

function setup(props: Partial<React.ComponentProps<typeof PageHero>> = {}) {
  render(
    <MemoryRouter>
      <PageHero
        rule="Our care"
        title="Eight kinds of care"
        lead="Everything your family needs."
        breadcrumb={CRUMBS}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('PageHero', () => {
  it('renders one h1, the rule label and the lead', () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Eight kinds of care');
    expect(screen.getByText('Our care')).toBeInTheDocument();
    expect(screen.getByText('Everything your family needs.')).toBeInTheDocument();
  });

  it('has a Breadcrumb nav with a link for Home and the current page unlinked', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).queryByRole('link', { name: 'Services' })).toBeNull();
    expect(within(nav).getByText('Services')).toHaveAttribute('aria-current', 'page');
  });

  it('does not link the last crumb even when it has a path', () => {
    setup({
      breadcrumb: [
        { label: 'Home', to: '/' },
        { label: 'Services', to: '/services' },
      ],
    });
    expect(screen.queryByRole('link', { name: 'Services' })).toBeNull();
  });

  it('omits the lead and the photo when not given', () => {
    setup({ lead: undefined });
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('p')).toBeNull();
  });

  it('shows the photo variant with its alt text', () => {
    setup({ photo: { src: '/images/a.jpg', alt: 'A nurse with a baby' } });
    expect(screen.getByRole('img', { name: 'A nurse with a baby' })).toHaveAttribute(
      'src',
      '/images/a.jpg',
    );
    expect(screen.getByRole('img', { name: 'A nurse with a baby' })).toHaveAttribute(
      'decoding',
      'async',
    );
  });
});
