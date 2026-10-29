import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Button } from '../ui/Button';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('is an h2 with a note and actions', () => {
    render(
      <MemoryRouter>
        <SectionHeader title="Recorded positions" note="3 positions" actions={<Button>Load map</Button>} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Recorded positions' })).toBeInTheDocument();
    expect(screen.getByText('3 positions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load map' })).toBeInTheDocument();
  });

  it('draws no note paragraph when there is none, and tolerates a false action', () => {
    const { container } = render(<SectionHeader title="Only a title" actions={false} />);
    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Only a title' })).toBeInTheDocument();
  });
});
