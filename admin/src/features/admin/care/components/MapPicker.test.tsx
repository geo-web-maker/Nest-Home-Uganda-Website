import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Leaflet needs real layout, which jsdom does not have, so a small fake records what the picker asks of it.
const fake = vi.hoisted(() => {
  const state = {
    handlers: {} as Record<string, (event: { latlng: { lat: number; lng: number } }) => void>,
    pin: null as null | { latlng: [number, number]; draggable: boolean; dragend?: () => void },
    ring: null as null | { latlng: [number, number]; radius: number },
    views: [] as Array<[[number, number], number]>,
    tiles: [] as string[],
  };
  const layer = () => ({ addTo: () => layer(), remove: vi.fn(), on: vi.fn(), bindTooltip() { return this; }, clearLayers: vi.fn() });
  const L = {
    map: () => ({
      on: (name: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => { state.handlers[name] = handler; },
      remove: vi.fn(),
      setView: (center: [number, number], zoom: number) => { state.views.push([center, zoom]); },
      panTo: vi.fn(),
      getBounds: () => ({ contains: () => true }),
    }),
    layerGroup: () => ({ addTo() { return this; }, clearLayers: vi.fn() }),
    tileLayer: (url: string) => { state.tiles.push(url); return layer(); },
    divIcon: () => ({}),
    marker: (position: [number, number], options: { draggable: boolean }) => {
      const pin = { latlng: position, draggable: options.draggable, dragend: undefined as undefined | (() => void) };
      state.pin = pin;
      return {
        addTo() { return this; },
        remove: vi.fn(),
        setLatLng: (next: [number, number]) => { pin.latlng = next; },
        getLatLng: () => ({ lat: pin.latlng[0], lng: pin.latlng[1] }),
        on: (_name: string, handler: () => void) => { pin.dragend = handler; },
      };
    },
    circle: (position: [number, number], options: { radius: number }) => {
      const ring = { latlng: position, radius: options.radius };
      state.ring = ring;
      return {
        addTo() { return this; }, remove: vi.fn(),
        setLatLng: (next: [number, number]) => { ring.latlng = next; },
        setRadius: (next: number) => { ring.radius = next; },
      };
    },
    circleMarker: () => ({ bindTooltip() { return this; }, addTo() { return this; } }),
  };
  return { state, L };
});

vi.mock('leaflet', () => ({ default: fake.L, ...fake.L }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { MapPicker } from './MapPicker';

beforeEach(() => {
  fake.state.handlers = {};
  fake.state.pin = null;
  fake.state.ring = null;
  fake.state.views = [];
  fake.state.tiles = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ready() {
  await waitFor(() => expect(fake.state.handlers.click).toBeTypeOf('function'));
}

describe('MapPicker', () => {
  it('shows no pin and asks for one when no location is chosen', async () => {
    render(<MapPicker lat="" lng="" radius="150" onChange={vi.fn()} />);
    await ready();

    expect(fake.state.pin).toBeNull();
    expect(screen.getByText('Search above, use your location, or tap the map to drop a pin.')).toBeInTheDocument();
  });

  it('drops the pin where the map is tapped, rounded to six decimals, keeping the radius', async () => {
    const onChange = vi.fn();
    render(<MapPicker lat="" lng="" radius="200" onChange={onChange} />);
    await ready();

    act(() => fake.state.handlers.click?.({ latlng: { lat: 0.3476123456, lng: 32.5825987654 } }));

    expect(onChange).toHaveBeenCalledWith({ lat: '0.347612', lng: '32.582599', radius: '200', source: 'pin' });
  });

  it('draws the pin and radius ring from the values it is given and lets the pin be dragged', async () => {
    const onChange = vi.fn();
    render(<MapPicker lat="0.31" lng="32.58" radius="300" onChange={onChange} />);
    await waitFor(() => expect(fake.state.pin).not.toBeNull());

    expect(fake.state.pin?.latlng).toEqual([0.31, 32.58]);
    expect(fake.state.pin?.draggable).toBe(true);
    expect(fake.state.ring?.radius).toBe(300);
    expect(fake.state.views[0]).toEqual([[0.31, 32.58], 17]);

    fake.state.pin!.latlng = [0.32, 32.59];
    act(() => fake.state.pin?.dragend?.());
    expect(onChange).toHaveBeenCalledWith({ lat: '0.320000', lng: '32.590000', radius: '300', source: 'pin' });
  });

  it('does not treat blank or out-of-range coordinates as a point', async () => {
    render(<MapPicker lat="91" lng="32.58" radius="150" onChange={vi.fn()} />);
    await ready();

    expect(fake.state.pin).toBeNull();
    fireEvent.click(screen.getByText('Enter coordinates instead'));
    expect(screen.getByRole('alert')).toHaveTextContent('Latitude must be between -90 and 90');
  });

  it('is view-only in read-only mode', async () => {
    const onChange = vi.fn();
    render(<MapPicker lat="0.31" lng="32.58" radius="150" onChange={onChange} readOnly />);
    await waitFor(() => expect(fake.state.pin).not.toBeNull());

    expect(fake.state.pin?.draggable).toBe(false);
    act(() => fake.state.handlers.click?.({ latlng: { lat: 1, lng: 1 } }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Search a place or landmark')).not.toBeInTheDocument();
  });

  it('only searches after an explicit action and lets the person choose between results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '0.31', lon: '32.58', display_name: 'Kireka, Wakiso' },
        { lat: '1.10', lon: '33.10', display_name: 'Kireka, Mbale' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<MapPicker lat="" lng="" radius="150" onChange={onChange} />);
    await ready();

    fireEvent.change(screen.getByLabelText('Search a place or landmark'), { target: { value: 'Kireka' } });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const second = await screen.findByRole('button', { name: 'Kireka, Mbale' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('countrycodes=ug');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(second);
    expect(onChange).toHaveBeenCalledWith({ lat: '1.100000', lng: '33.100000', radius: '150', source: 'search' });
  });

  it('sets the pin from the device location', async () => {
    const getCurrentPosition = vi.fn((success: (position: unknown) => void) =>
      success({ coords: { latitude: 0.3, longitude: 32.6, accuracy: 12.4 } }));
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const onChange = vi.fn();
    render(<MapPicker lat="" lng="" radius="150" onChange={onChange} />);
    await ready();

    fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(onChange).toHaveBeenCalledWith({ lat: '0.300000', lng: '32.600000', radius: '150', source: 'gps' });
    expect(screen.getByRole('status')).toHaveTextContent('accurate to about 12 m');
  });

  it('records typed coordinates as such, and a radius change carries no source', async () => {
    const onChange = vi.fn();
    render(<MapPicker lat="0.31" lng="32.58" radius="150" onChange={onChange} />);
    await ready();

    fireEvent.click(screen.getByText('Enter coordinates instead'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '0.4' } });
    expect(onChange).toHaveBeenLastCalledWith({ lat: '0.4', lng: '32.58', radius: '150', source: 'coordinates' });

    fireEvent.change(screen.getByLabelText('Arrival radius in metres'), { target: { value: '300' } });
    expect(onChange).toHaveBeenLastCalledWith({ lat: '0.31', lng: '32.58', radius: '300' });
  });

  it('swaps to satellite imagery on request', async () => {
    render(<MapPicker lat="" lng="" radius="150" onChange={vi.fn()} />);
    await waitFor(() => expect(fake.state.tiles.length).toBeGreaterThan(0));
    expect(fake.state.tiles.at(-1)).toContain('tile.openstreetmap.org');

    fireEvent.click(screen.getByRole('button', { name: 'Show satellite' }));
    await waitFor(() => expect(fake.state.tiles.at(-1)).toContain('World_Imagery'));
  });
});
