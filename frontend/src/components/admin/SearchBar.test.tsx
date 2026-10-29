import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Field } from '../ui/Field';
import { SearchBar } from './SearchBar';

const base = {
  label: 'Search and filter',
  searchLabel: 'Search',
  buttonLabel: 'Find',
  placeholder: 'Name, phone or area',
};

function renderBar(props: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  const onSearch = vi.fn();
  const view = render(
    <MemoryRouter>
      <SearchBar {...base} value="" onSearch={onSearch} {...props} />
    </MemoryRouter>,
  );
  return { onSearch, ...view };
}

describe('SearchBar', () => {
  it('is a search landmark with a labelled box and a button', () => {
    renderBar();
    expect(screen.getByRole('search', { name: 'Search and filter' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Name, phone or area');
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('type', 'submit');
  });

  it('applies the trimmed text on the button, and on Enter', async () => {
    const { onSearch } = renderBar();
    await userEvent.type(screen.getByRole('searchbox'), '  Grace  ');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onSearch).toHaveBeenLastCalledWith('Grace');
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'Mary{Enter}');
    expect(onSearch).toHaveBeenLastCalledWith('Mary');
  });

  it('does not search while typing', async () => {
    const { onSearch } = renderBar();
    await userEvent.type(screen.getByRole('searchbox'), 'abc');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('starts from the applied query and resets the box when that query changes', () => {
    const { rerender } = renderBar({ value: 'Grace' });
    expect(screen.getByRole('searchbox')).toHaveValue('Grace');
    rerender(
      <MemoryRouter>
        <SearchBar {...base} value="" onSearch={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('puts extra filters in the same bar, with the button at the control size', () => {
    renderBar({ children: <Field label="Service" kind="select"><option>All</option></Field> });
    const bar = screen.getByRole('search', { name: 'Search and filter' });
    expect(bar).toContainElement(screen.getByLabelText('Service'));
    expect(screen.getByRole('button', { name: 'Find' })).toHaveAttribute('data-size', 'control');
  });

  it('limits the query length', () => {
    renderBar({ maxLength: 20 });
    expect(screen.getByRole('searchbox')).toHaveAttribute('maxlength', '20');
  });
});
