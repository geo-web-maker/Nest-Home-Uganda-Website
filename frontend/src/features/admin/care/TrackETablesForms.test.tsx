import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CareWorkspace } from './CareWorkspace';

describe('Track E admin care table/form baseline', () => {
  it('renders the care workspace navigation without throwing', () => {
    render(<MemoryRouter><CareWorkspace /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Visits' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('exposes the operational screens needed for table/form coverage', () => {
    render(<MemoryRouter><CareWorkspace /></MemoryRouter>);
    for (const label of ['Nurses', 'Clients', 'Places', 'Flags', 'Timesheets', 'Reports', 'Settings']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
