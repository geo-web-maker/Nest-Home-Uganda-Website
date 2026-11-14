import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Pagination } from './Pagination';

const labels = {
  nav: 'Pages',
  previous: 'Previous',
  next: 'Next',
  summary: (from: number, to: number, total: number) => `${from} to ${to} of ${total}`,
};

function setup(props: { page: number; total: number; onChange?: (page: number) => void }) {
  const onChange = props.onChange ?? vi.fn();
  render(
    <MemoryRouter>
      <Pagination
        page={props.page}
        pageSize={25}
        total={props.total}
        onChange={onChange}
        labels={labels}
      />
    </MemoryRouter>,
  );
  return onChange;
}

describe('Pagination', () => {
  it('shows the range for the current page', () => {
    setup({ page: 2, total: 60 });
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
    expect(screen.getByText('26 to 50 of 60')).toBeInTheDocument();
  });

  it('ends the range at the total on the last page', () => {
    setup({ page: 3, total: 60 });
    expect(screen.getByText('51 to 60 of 60')).toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Pagination page={1} pageSize={25} total={60} onChange={vi.fn()} labels={labels} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    unmount();
    setup({ page: 3, total: 60 });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onChange with the next and previous page', async () => {
    const user = userEvent.setup();
    const onChange = setup({ page: 2, total: 60 });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('hides the buttons when everything fits on one page and renders nothing when empty', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Pagination page={1} pageSize={25} total={10} onChange={vi.fn()} labels={labels} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 to 10 of 10')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    setup({ page: 1, total: 0 });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
