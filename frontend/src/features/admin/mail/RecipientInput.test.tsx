import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/client';
import { RecipientInput } from './RecipientInput';

vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <><RecipientInput label="To" value={value} onChange={setValue} /><output data-testid="value">{value}</output></>;
}

describe('RecipientInput', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockResolvedValue({
      recent: [{ address: 'ruth@mail.test', name: 'Ruth', source: 'recent' }],
      directory: [{ address: 'sam@mail.test', name: 'Sam', source: 'directory' }],
    });
  });

  it('offers recent people on focus and adds several with a click each', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Ruth/ }));
    await user.click(await screen.findByRole('option', { name: /Sam/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('ruth@mail.test, sam@mail.test');
  });

  it('turns a pasted list into chips and lets one be removed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox'));
    await user.paste('a@x.test; b@x.test\nc@x.test');
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('a@x.test, b@x.test, c@x.test'));
    await user.click(screen.getByRole('button', { name: 'Remove b@x.test' }));
    expect(screen.getByTestId('value')).toHaveTextContent('a@x.test, c@x.test');
  });

  it('keeps text that is still being typed in the value so Send can react to it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox'), 'sam@mail.test');
    expect(screen.getByTestId('value')).toHaveTextContent('sam@mail.test');
  });
});
