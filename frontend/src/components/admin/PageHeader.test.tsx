import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as the h1', () => {
    render(<PageHeader title="Enquiries" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Enquiries' })).toBeInTheDocument();
  });

  it('shows the subtitle and actions only when given', () => {
    const { rerender } = render(<PageHeader title="Enquiries" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <PageHeader title="Enquiries" subtitle="All requests" actions={<button>Add</button>} />,
    );
    expect(screen.getByText('All requests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
