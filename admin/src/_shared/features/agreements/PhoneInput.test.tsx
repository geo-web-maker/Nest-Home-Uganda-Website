/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhoneInput } from './PhoneInput';

function Harness({ initial = '', onCommit = () => {} }: { initial?: string; onCommit?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return <><PhoneInput id="p" value={value} readOnly={false} onChange={setValue} onCommit={onCommit} /><output data-testid="out">{value}</output></>;
}

describe('PhoneInput', () => {
  it('defaults to Uganda and stores +256 plus the digits without the leading zero', () => {
    render(<Harness />);
    expect((screen.getByLabelText('Country code') as HTMLSelectElement).value).toBe('UG');
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0771234567' } });
    expect(screen.getByTestId('out').textContent).toBe('+256771234567');
  });

  it('lets staff choose another country', () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'GB' } });
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '2079460958' } });
    fireEvent.blur(screen.getByLabelText('Phone number'));
    expect(screen.getByTestId('out').textContent).toBe('+442079460958');
    expect(onCommit).toHaveBeenLastCalledWith('+442079460958');
  });

  it('shows a saved international number with its country selected', () => {
    render(<Harness initial="+14155550132" />);
    expect((screen.getByLabelText('Country code') as HTMLSelectElement).value).toBe('US');
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('4155550132');
  });
});
