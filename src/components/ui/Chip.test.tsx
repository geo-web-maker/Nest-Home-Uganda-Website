import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Chip } from './Chip';

function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <Chip selected={on} onToggle={() => setOn((v) => !v)}>
      Elderly care
    </Chip>
  );
}

describe('Chip', () => {
  it('is a toggle button that reports its pressed state', async () => {
    render(<Toggle />);
    const chip = screen.getByRole('button', { name: 'Elderly care' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('is operable from the keyboard', async () => {
    render(<Toggle />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Elderly care' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not toggle when disabled', async () => {
    const onToggle = vi.fn();
    render(
      <Chip selected={false} onToggle={onToggle} disabled>
        Wound care
      </Chip>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Wound care' }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders the area variant as static text, not a button', () => {
    render(<Chip variant="area">Ntinda</Chip>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Ntinda')).toBeInTheDocument();
  });
});
