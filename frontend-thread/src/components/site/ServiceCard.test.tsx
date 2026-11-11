import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ServicePublic } from '../../types';
import { ServiceCard } from './ServiceCard';

const BASE: ServicePublic = {
  id: 'a'.repeat(24),
  slug: 'postnatal-care',
  name: 'Postnatal care',
  summary: 'Care for mother and baby',
  number: 2,
  icon_key: null,
  photo_media_id: null,
};

function setup(service: Partial<ServicePublic> = {}, photoUrl?: string | null) {
  const { container } = render(
    <MemoryRouter>
      <ServiceCard service={{ ...BASE, ...service }} photoUrl={photoUrl} />
    </MemoryRouter>,
  );
  return container;
}

describe('ServiceCard', () => {
  it('is one link to the service page with an h3 name and the summary', () => {
    setup();
    const link = screen.getByRole('link', { name: /Postnatal care/ });
    expect(link).toHaveAttribute('href', '/services/postnatal-care');
    expect(screen.getByRole('heading', { level: 3, name: 'Postnatal care' })).toBeInTheDocument();
    expect(screen.getByText('Care for mother and baby')).toBeInTheDocument();
  });

  it('shows the photo, decorative, when a photo URL is given', () => {
    const container = setup({}, '/images/services/service-1-postnatal.jpg');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/images/services/service-1-postnatal.jpg');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(screen.queryByTestId('service-tile')).toBeNull();
  });

  it.each([
    ['physiotherapy', 'physiotherapy-at-home'],
    ['palliative', 'palliative-respite-care'],
    ['pediatric', 'pediatric-home-nursing'],
    ['hospital-to-home', 'hospital-to-home'],
  ])('shows an aria-hidden %s icon tile when there is no photo', (icon_key, slug) => {
    const container = setup({ icon_key, slug });
    const svg = screen.getByTestId('service-tile').querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the slug for the icon and to the number when neither is known', () => {
    setup({ icon_key: null, slug: 'physiotherapy-at-home' });
    expect(screen.getByTestId('service-tile').querySelector('svg')).not.toBeNull();
  });

  it('shows the service number on the tile for a service with no icon and no photo', () => {
    setup({ icon_key: null, slug: 'elderly-companion-care', number: 1 });
    const tile = screen.getByTestId('service-tile');
    expect(tile.querySelector('svg')).toBeNull();
    expect(tile).toHaveTextContent('1');
  });

  it('omits the summary line when the service has none', () => {
    setup({ summary: '' });
    expect(screen.queryByText('Care for mother and baby')).toBeNull();
  });
});
