import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Field } from './Field';
import type { FieldElement } from './Field';

describe('Field', () => {
  it('links the label to the input', async () => {
    render(<Field label="Full name" />);
    const input = screen.getByLabelText('Full name');
    await userEvent.type(input, 'Grace');
    expect(input).toHaveValue('Grace');
  });

  it('marks required fields in the label text, not by colour alone', () => {
    render(<Field label="Phone" required requiredLabel="(required)" />);
    expect(screen.getByLabelText('Phone (required)')).toHaveAttribute('aria-required', 'true');
  });

  it('shows an error with role alert and links it with aria-describedby', () => {
    render(<Field label="Phone" error="Enter a valid phone number." />);
    const input = screen.getByLabelText('Phone');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter a valid phone number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
  });

  it('has no error attributes when valid', () => {
    render(<Field label="Phone" />);
    const input = screen.getByLabelText('Phone');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a select with options', async () => {
    render(
      <Field kind="select" label="Area" defaultValue="">
        <option value="">Choose</option>
        <option value="ntinda">Ntinda</option>
      </Field>,
    );
    const select = screen.getByLabelText('Area');
    expect(select.tagName).toBe('SELECT');
    await userEvent.selectOptions(select, 'ntinda');
    expect(select).toHaveValue('ntinda');
  });

  it('renders a textarea', () => {
    render(<Field kind="textarea" label="Note" />);
    expect(screen.getByLabelText('Note').tagName).toBe('TEXTAREA');
  });

  it('forwards the ref to the control', () => {
    const ref = createRef<FieldElement>();
    render(<Field ref={ref} label="Name" />);
    expect(ref.current).toBe(screen.getByLabelText('Name'));
  });

  it('uses a caller supplied id', () => {
    render(<Field label="Name" id="booking-name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'booking-name');
  });
});
