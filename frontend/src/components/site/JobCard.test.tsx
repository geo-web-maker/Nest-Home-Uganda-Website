import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { JobCard } from './JobCard';

const props = {
  title: 'Registered Nurse',
  location: 'Kampala',
  type: 'Full-time',
  href: '/careers/abc',
  applyLabel: 'View role',
};

describe('JobCard', () => {
  it('renders role and metadata', () => {
    render(
      <MemoryRouter>
        <JobCard {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: props.title })).toBeInTheDocument();
    expect(screen.getByText('Kampala · Full-time')).toBeInTheDocument();
  });
  it('links to the supplied job route', () => {
    render(
      <MemoryRouter>
        <JobCard {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'View role' })).toHaveAttribute('href', '/careers/abc');
  });
  it('shows closing information only when both values are supplied', () => {
    render(
      <MemoryRouter>
        <JobCard {...props} closesOn="2026-12-01" closingLabel="Closes" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Closes: 2026-12-01')).toBeInTheDocument();
  });
  it('does not show an empty closing row', () => {
    render(
      <MemoryRouter>
        <JobCard {...props} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Closes:/)).not.toBeInTheDocument();
  });
});
