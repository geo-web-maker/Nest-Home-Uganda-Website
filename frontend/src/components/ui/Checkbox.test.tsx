import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('links the label to the box and toggles from a click on the text', async () => {
    const onChange = vi.fn();
    render(<Checkbox label='Published' checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByText('Published'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Published' })).toBeInTheDocument();
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox label='Locked' checked disabled onChange={onChange} />);
    await userEvent.click(screen.getByText('Locked'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Locked' })).toBeDisabled();
  });

  it('works uncontrolled with defaultChecked and a name', () => {
    render(<Checkbox label='Enabled' name='value' defaultChecked />);
    const box = screen.getByRole('checkbox', { name: 'Enabled' });
    expect(box).toBeChecked();
    expect(box).toHaveAttribute('name', 'value');
  });

  it('keeps the accessible name when the label is hidden', () => {
    render(<Checkbox label='visit.cap enabled' hideLabel />);
    expect(screen.getByLabelText('visit.cap enabled')).toHaveAttribute('type', 'checkbox');
  });

  it('forwards the ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} label='Ref' />);
    expect(ref.current).toBe(screen.getByRole('checkbox'));
  });

  it('accepts rich label content', () => {
    render(<Checkbox label={<span>Enable <strong>routing</strong></span>} />);
    expect(screen.getByRole('checkbox', { name: 'Enable routing' })).toBeInTheDocument();
  });
});
