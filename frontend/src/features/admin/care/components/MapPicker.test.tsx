import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapPicker } from './MapPicker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MapPicker location validation', () => {
  it('does not treat blank coordinates as zero or render a map preview', () => {
    render(<MapPicker lat="" lng="" radius="150" onChange={vi.fn()} />);

    expect(screen.queryByTitle('OpenStreetMap location preview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate location' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter latitude, longitude, and radius before validating.',
    );
  });

  it('rejects out-of-range latitude before reporting the location as validated', () => {
    render(<MapPicker lat="91" lng="32.58" radius="150" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Validate location' }));
    expect(screen.getByRole('status')).toHaveTextContent('Latitude must be between -90 and 90.');
  });

  it('only geocodes after an explicit user action and returns rounded coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '0.31', lon: '32.58', display_name: 'Kampala, Uganda' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<MapPicker lat="" lng="" radius="150" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Search address or nearby landmark'), {
      target: { value: 'Kampala' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Find address' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ lat: '0.310000', lng: '32.580000', radius: '150' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Address located. Check the pin and radius before saving.',
    );
  });
});
