import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { FilterBar, filterBarGrow } from './FilterBar';

function renderBar(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('FilterBar', () => {
  it('is a named group when it has no submit handler', () => {
    renderBar(
      <FilterBar label="Filter visits">
        <Field label="Status" />
      </FilterBar>,
    );
    const group = screen.getByRole('group', { name: 'Filter visits' });
    expect(group.tagName).toBe('DIV');
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('is a form with a submit handler, and Enter in a field submits it', async () => {
    const onSubmit = vi.fn();
    renderBar(
      <FilterBar label="Filter activity" onSubmit={onSubmit} actions={<Button type="submit">Apply</Button>}>
        <Field label="From" />
      </FilterBar>,
    );
    const form = screen.getByRole('group', { name: 'Filter activity' });
    expect(form.tagName).toBe('FORM');
    await userEvent.type(screen.getByLabelText('From'), 'x{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('can be marked as a search landmark', () => {
    renderBar(
      <FilterBar label="Find enquiries" role="search" onSubmit={vi.fn()}>
        <Field label="Search" type="search" />
      </FilterBar>,
    );
    expect(screen.getByRole('search', { name: 'Find enquiries' })).toBeInTheDocument();
  });

  it('never submits the page: the default form action is prevented', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.defaultPrevented);
    renderBar(
      <FilterBar label="Filters" onSubmit={onSubmit} actions={<Button type="submit">Go</Button>}>
        <Field label="Name" />
      </FilterBar>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit.mock.results[0]?.value).toBe(true);
  });

  it('draws buttons in `actions` at the control size so they match the inputs beside them', () => {
    renderBar(
      <FilterBar
        label="Filters"
        actions={
          <>
            <Button type="button">Preview</Button>
            <Button type="button" variant="outline">
              Download
            </Button>
          </>
        }
      >
        <Field label="From" />
      </FilterBar>,
    );
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('data-size', 'control');
    expect(screen.getByRole('button', { name: 'Download' })).toHaveAttribute('data-size', 'control');
  });

  it('keeps fields, then the actions, then the meta text, in that order', () => {
    renderBar(
      <FilterBar label="Filters" meta="3 shown" actions={<Button type="button">Go</Button>}>
        <Field label="One" />
        <Field label="Two" />
      </FilterBar>,
    );
    const group = screen.getByRole('group', { name: 'Filters' });
    const kids = Array.from(group.children);
    expect(kids).toHaveLength(4);
    expect(kids[0]).toContainElement(screen.getByLabelText('One'));
    expect(kids[1]).toContainElement(screen.getByLabelText('Two'));
    expect(kids[2]).toContainElement(screen.getByRole('button', { name: 'Go' }));
    expect(kids[3]).toHaveTextContent('3 shown');
  });

  it('renders no empty actions or meta cell when there are none', () => {
    renderBar(
      <FilterBar label="Filters">
        <Field label="Only" />
      </FilterBar>,
    );
    expect(screen.getByRole('group', { name: 'Filters' }).children).toHaveLength(1);
  });

  it('exposes a class for a field that should be wider than its siblings', () => {
    // The exact class name depends on how vitest treats CSS modules, so compare against the export.
    expect(filterBarGrow).toMatch(/grow/);
    renderBar(
      <FilterBar label="Filters">
        <Field label="Search" className={filterBarGrow} />
      </FilterBar>,
    );
    expect(screen.getByLabelText('Search').parentElement).toHaveClass(filterBarGrow ?? '');
  });
});
