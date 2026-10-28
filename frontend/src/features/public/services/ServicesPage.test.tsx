import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Seo } from '../../../components/site/Seo';
import { ApiError, apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import type { ServicePublic } from '../../../types';
import { ServicesPage } from './ServicesPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: vi.fn(() => null) }));
vi.mock('../booking/bookingApi', () => ({ trackClick: vi.fn() }));

const NAMES = [
  ['elderly-companion-care', 'Elderly and companion care'],
  ['postnatal-newborn-care', 'Postnatal and newborn care'],
  ['wound-care-medication', 'Wound care and medication'],
  ['physiotherapy-at-home', 'Physiotherapy at home'],
  ['palliative-respite-care', 'Palliative and respite care'],
  ['chronic-disease-management', 'Chronic disease management'],
  ['pediatric-home-nursing', 'Pediatric home nursing'],
  ['hospital-to-home', 'Hospital to home transition'],
] as const;
const ICONS: (string | null)[] = [
  null,
  null,
  null,
  'physiotherapy',
  'palliative',
  null,
  'pediatric',
  'hospital-to-home',
];

const SERVICES: ServicePublic[] = NAMES.map(([slug, name], index) => ({
  id: String(index + 1).padStart(24, '0'),
  slug,
  name,
  summary: `Summary ${index + 1}`,
  number: index + 1,
  icon_key: ICONS[index] ?? null,
  photo_media_id: null,
}));

function setup() {
  const { container } = render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/services']}>
        <ServicesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return container;
}

describe('ServicesPage', () => {
  beforeEach(() => vi.mocked(Seo).mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('shows the hero, eight service cards from the API in order, and the CTA band', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(SERVICES);
    setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Eight kinds of care, one trusted team.',
    );
    expect(
      screen.getByText('Everything your family needs, delivered at home.'),
    ).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByText('Services')).toHaveAttribute('aria-current', 'page');

    const cards = await screen.findAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(NAMES.map(([, name]) => name));
    expect(screen.getByRole('link', { name: /Postnatal and newborn care/ })).toHaveAttribute(
      'href',
      '/services/postnatal-newborn-care',
    );
    expect(get).toHaveBeenCalledWith('/public/services', { params: { lang: 'en' } });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Not sure which care you need?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book a home visit' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  it('shows photos for services 1, 2, 3 and 6 and icon tiles for 4, 5, 7 and 8', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(SERVICES);
    const container = setup();
    await screen.findAllByRole('heading', { level: 3 });

    const photos = [...container.querySelectorAll('li img')].map((img) => img.getAttribute('src'));
    expect(photos).toEqual([
      '/images/services/service-0-elderly.jpg',
      '/images/services/service-1-postnatal.jpg',
      '/images/services/service-2-wound-care.jpg',
      '/images/services/service-5-chronic.jpg',
    ]);
    expect(screen.getAllByTestId('service-tile')).toHaveLength(4);
  });

  it('shows a busy skeleton and no cards while loading, with the hero and CTA already there', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();

    const list = screen.getByRole('list', { name: 'Loading services' });
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Not sure which care you need?' }),
    ).toBeInTheDocument();
  });

  it('shows an alert with a retry button on failure, and the cards after a successful retry', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new ApiError(500, 'http_error', 'Boom'))
      .mockResolvedValueOnce(SERVICES);
    setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load our services just now.',
    );
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(8));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('sets the page title, description and canonical path', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();

    expect(vi.mocked(Seo).mock.calls[0]?.[0]).toEqual({
      title: 'Home Care Services in Kampala | Well Nest Home Care Uganda',
      description: 'Everything your family needs, delivered at home. See our eight kinds of care.',
      path: '/services',
    });
  });
});
