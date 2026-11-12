import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapPlaceholder } from './MapPlaceholder';

describe('MapPlaceholder', () => {
  it('exposes its label as an image description', () => {
    render(<MapPlaceholder label="Map of service areas" />);
    expect(screen.getByRole('img', { name: 'Map of service areas' })).toBeInTheDocument();
  });
  it('renders an optional description', () => {
    render(<MapPlaceholder label="Map" description="Map embed supplied by the client." />);
    expect(screen.getByText('Map embed supplied by the client.')).toBeInTheDocument();
  });
  it('omits an empty description', () => {
    const { container } = render(<MapPlaceholder label="Map" description="" />);
    expect(container.querySelector('span')).toBeNull();
  });
  it('does not invent coordinates or a remote map source', () => {
    const { container } = render(<MapPlaceholder label="Map" />);
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });
});
