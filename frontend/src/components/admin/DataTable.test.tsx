import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DataTable } from './DataTable';

type Row = { id: string; name: string; phone: string };
const ROWS: Row[] = [
  { id: '1', name: 'Grace', phone: '0787 000 111' },
  { id: '2', name: 'Peter', phone: '0787 000 222' },
];
const COLUMNS = [
  { key: 'name', header: 'Name', cell: (r: Row) => r.name },
  { key: 'phone', header: 'Phone', cell: (r: Row) => r.phone },
  { key: 'act', header: 'Action', cell: () => <button>Call</button> },
];
const LABELS = { caption: 'Enquiries', loading: 'Loading enquiries', empty: 'No enquiries yet' };

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function setup(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DataTable<Row>
                columns={COLUMNS}
                rows={ROWS}
                getRowKey={(r) => r.id}
                labels={LABELS}
                {...props}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DataTable', () => {
  it('renders a named table with a header cell per column and a row per item', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Enquiries' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Phone', 'Action']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Peter')).toBeInTheDocument();
  });

  it('gives every cell except the first a label for the phone card layout', () => {
    setup();
    expect(screen.getByText('Grace')).not.toHaveAttribute('data-label');
    expect(screen.getByText('0787 000 111')).toHaveAttribute('data-label', 'Phone');
  });

  it('makes no row clickable without getRowHref', async () => {
    setup();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('0787 000 111'));
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('links the first cell and opens the detail screen on a row click', async () => {
    setup({ getRowHref: (r) => `/admin/enquiries/${r.id}` });
    expect(screen.getByRole('link', { name: 'Grace' })).toHaveAttribute(
      'href',
      '/admin/enquiries/1',
    );
    await userEvent.click(screen.getByText('0787 000 222'));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/enquiries/2');
  });

  it('does not open the row when a button inside it is clicked', async () => {
    setup({ getRowHref: (r) => `/admin/enquiries/${r.id}` });
    const [firstCall] = screen.getAllByRole('button', { name: 'Call' });
    await userEvent.click(firstCall as HTMLElement);
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('shows a loading status instead of rows while loading with no data', () => {
    setup({ rows: [], loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading enquiries');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty message when there are no rows', () => {
    setup({ rows: [] });
    expect(screen.getByText('No enquiries yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
