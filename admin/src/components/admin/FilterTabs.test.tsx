import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { FilterTabs } from './FilterTabs';

const TABS = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
];

function Harness({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <FilterTabs
      tabs={TABS}
      value={value}
      label="Filter by status"
      controls="list"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('FilterTabs', () => {
  it('is a labelled tablist with the selected tab marked', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Filter by status' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-controls', 'list');
  });

  it('calls onChange with the clicked tab value', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Contacted' }));
    expect(onChange).toHaveBeenCalledWith('contacted');
    expect(screen.getByRole('tab', { name: 'Contacted' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps only the selected tab in the tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves and selects with the arrow keys, wrapping at the ends, and with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'All' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'New' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Contacted' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Contacted' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveFocus();
  });
});
