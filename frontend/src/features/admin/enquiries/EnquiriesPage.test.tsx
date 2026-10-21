import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { EnquiryListItem } from '../../../types';
import { EnquiriesPage } from './EnquiriesPage';
import { useEnquiries } from './useEnquiries';

vi.mock('./useEnquiries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useEnquiries')>()),
  useEnquiries: vi.fn(),
}));
vi.mock('../../../lib/queries/services', () => ({
  useServices: () => ({
    data: [
      { id: 'a'.repeat(24), name: 'Postnatal care' },
      { id: 'b'.repeat(24), name: 'Wound care' },
    ],
  }),
}));

const ROW: EnquiryListItem = {
  id: 'e1',
  reference: 'NHC-0001',
  name: 'Grace Namuli',
  phone_e164: '+256787499988',
  services: [
    { service_id: 'a'.repeat(24), name: 'Postnatal care' },
    { service_id: 'b'.repeat(24), name: 'Wound care' },
  ],
  area: 'Kyaliwajjala',
  status: 'new',
  source: 'form',
  assigned_to: null,
  created_at: '2026-10-19T09:30:00Z',
};

type HookResult = Partial<ReturnType<typeof useEnquiries>>;
const refetch = vi.fn();

function mockHook(result: HookResult = {}) {
  vi.mocked(useEnquiries).mockReturnValue({
    data: { items: [ROW], total: 60, page: 1, page_size: 25 },
    isError: false,
    isFetching: false,
    refetch,
    ...result,
  } as ReturnType<typeof useEnquiries>);
}

function Where() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function setup(path = '/admin/enquiries') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/enquiries"
          element={
            <>
              <EnquiriesPage />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const lastFilters = () => vi.mocked(useEnquiries).mock.lastCall?.[0];
const search = () => screen.getByTestId('search').textContent;

beforeEach(() => {
  vi.mocked(useEnquiries).mockReset();
  refetch.mockReset();
  mockHook();
});

describe('EnquiriesPage', () => {
  it('shows the title, the seven columns and a linked row with a status badge', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Enquiries' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Enquiries' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Phone', 'Service', 'Area', 'Status', 'Received', 'Assigned']);
    expect(within(table).getByRole('link', { name: 'Grace Namuli' })).toHaveAttribute(
      'href',
      '/admin/enquiries/e1',
    );
    expect(within(table).getByText('0787 499 988')).toBeInTheDocument();
    expect(within(table).getByText('Postnatal care, Wound care')).toBeInTheDocument();
    expect(within(table).getByText('New')).toHaveAttribute('data-tone', 'new');
    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
    expect(within(table).getByText('19 Oct 2026, 12:30')).toBeInTheDocument();
  });

  it('does not offer Export CSV', () => {
    setup();
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument();
  });

  it('reads the filters from the URL', () => {
    setup('/admin/enquiries?status=contacted&q=Grace&page=2&sort=created_at');
    expect(lastFilters()).toMatchObject({
      status: 'contacted',
      q: 'Grace',
      page: 2,
      sort: 'created_at',
    });
    expect(screen.getByRole('tab', { name: 'Contacted' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Grace');
  });

  it('sets the status from a tab and goes back to page 1', async () => {
    setup('/admin/enquiries?page=3');
    await userEvent.click(screen.getByRole('tab', { name: 'Assessment booked' }));
    expect(search()).toBe('?status=assessment_booked');
    expect(lastFilters()).toMatchObject({ status: 'assessment_booked', page: 1 });
  });

  it('searches on submit and trims the text', async () => {
    setup();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), '  Grace {Enter}');
    expect(search()).toBe('?q=Grace');
  });

  it('filters by service and by date range', async () => {
    setup();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Service' }),
      screen.getByRole('option', { name: 'Wound care' }),
    );
    expect(search()).toBe(`?service=${'b'.repeat(24)}`);
    await userEvent.type(screen.getByLabelText('From'), '2026-10-01');
    expect(search()).toContain('from=2026-10-01');
  });

  it('pages with Next and keeps the other filters', async () => {
    setup('/admin/enquiries?status=new');
    expect(screen.getByText('1 to 25 of 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(search()).toBe('?status=new&page=2');
  });

  it('shows an error with a retry when nothing loaded', async () => {
    mockHook({ data: undefined, isError: true });
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load enquiries just now.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty message when no enquiry matches', () => {
    mockHook({ data: { items: [], total: 0, page: 1, page_size: 25 } });
    setup();
    expect(screen.getByText('No enquiries match these filters.')).toBeInTheDocument();
  });
});
