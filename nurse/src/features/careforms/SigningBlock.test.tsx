import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SigningBlock } from './SigningBlock';

describe('SigningBlock', () => {
  it('shows the four client roles and refuses to submit without the e-sign tick', async () => {
    const onSubmit = vi.fn();
    render(<SigningBlock mode="client" formId="03" defaultName="Mary K" autoEmail={false} clientAgreed={false} onClientAgreed={() => undefined} onSubmit={onSubmit} />);
    for (const r of ['Client', 'Representative', 'Interpreter or reader', 'Witness']) expect(screen.getByRole('button', { name: r })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Client signs' }));
    await waitFor(() => expect(screen.getByText(/agree to sign electronically|drawn signature/i)).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('hides the email-copy tick unless the admin switch is on', () => {
    const { rerender } = render(<SigningBlock mode="client" formId="03" defaultName="M" autoEmail={false} clientAgreed={false} onClientAgreed={() => undefined} onSubmit={() => undefined} />);
    expect(screen.queryByText(/agrees to receive a copy by email/)).toBeNull(); expect(screen.getByText(/Copies are not emailed/)).toBeTruthy();
    rerender(<SigningBlock mode="client" formId="03" defaultName="M" autoEmail clientAgreed={false} onClientAgreed={() => undefined} onSubmit={() => undefined} />);
    expect(screen.getByText(/agrees to receive a copy by email/)).toBeTruthy();
  });
  it('offers a thumbprint option that needs interpreter details', () => {
    render(<SigningBlock mode="client" formId="03" defaultName="M" autoEmail={false} clientAgreed={false} onClientAgreed={() => undefined} onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thumbprint' }));
    expect(screen.getByLabelText('Interpreter / reader name')).toBeTruthy();
  });
  it('nurse signing is replaced by a Profile prompt when UNMC details are missing', () => {
    render(<MemoryRouter><SigningBlock mode="nurse" formId="03" online problem={{ message: 'Add your UNMC number to your profile before signing.' }} onSubmit={() => undefined} /></MemoryRouter>);
    expect(screen.getByText(/UNMC number/)).toBeTruthy(); expect(screen.getByRole('link', { name: 'Open Profile' }).getAttribute('href')).toBe('/profile');
    expect(screen.queryByRole('button', { name: 'Sign as clinician' })).toBeNull();
  });
  it('nurse account password is offered and needs a connection', async () => {
    const onSubmit = vi.fn();
    render(<MemoryRouter><SigningBlock mode="nurse" formId="03" online={false} problem={null} onSubmit={onSubmit} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Account password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign as clinician' }));
    await waitFor(() => expect(screen.getByText(/needs a connection/)).toBeTruthy()); expect(onSubmit).not.toHaveBeenCalled();
  });
});
