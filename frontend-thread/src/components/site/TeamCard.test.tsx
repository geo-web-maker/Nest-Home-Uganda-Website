import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamCard } from './TeamCard';

const props = {
  name: 'Nurse name supplied by client',
  role: 'Role and qualification supplied by client',
  placeholderLabel: 'Photo',
};

describe('TeamCard', () => {
  it('renders the provided name and role', () => {
    render(<TeamCard {...props} />);
    expect(screen.getByRole('heading', { name: props.name })).toBeInTheDocument();
    expect(screen.getByText(props.role)).toBeInTheDocument();
  });
  it('shows a placeholder when no image URL exists', () => {
    render(<TeamCard {...props} />);
    expect(screen.getByLabelText('Photo')).toBeInTheDocument();
  });
  it('renders an image with meaningful alternative text', () => {
    render(<TeamCard {...props} photoUrl="/portrait.jpg" />);
    const image = screen.getByRole('img', { name: `${props.name}, ${props.role}` });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
  });
  it('uses the supplied image alt text when available', () => {
    render(<TeamCard {...props} photoUrl="/portrait.jpg" photoAlt="Portrait description" />);
    expect(screen.getByRole('img', { name: 'Portrait description' })).toBeInTheDocument();
  });
});
