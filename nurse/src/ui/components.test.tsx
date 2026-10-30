import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';
import { Banner } from './Banner';
import { Card } from './Card';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { MapPlaceholder } from './MapPlaceholder';
import { PillButton } from './PillButton';
import { Row } from './Row';

describe('mockup-parity component kit', () => {
  it('renders nested cards, status chips and an accessible profile avatar', () => {
    const { container } = render(<Card><h2>Visit summary</h2><Chip kind="pg">In progress</Chip><Avatar initials="AN" label="Amina Nakato" /></Card>);
    expect(container.querySelector('.mk-card > .mk-card__in')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toHaveClass('mk-chip--pg');
    expect(screen.getByRole('img', { name: 'Amina Nakato' })).toBeInTheDocument();
  });

  it('keeps buttons semantic and renders line icons as decorative SVGs', () => {
    render(<PillButton tone="forest">Continue</PillButton>);
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('mk-btn--forest');
    render(<Icon name="pin" />);
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('provides status and map labels without requiring network imagery', () => {
    render(<><Banner tone="warn">Offline work is saved.</Banner><MapPlaceholder title="Visit location" subtitle="Address unavailable" /><Row label="Next visit" value="None" /></>);
    expect(screen.getByRole('status')).toHaveTextContent('Offline work is saved.');
    expect(screen.getByRole('img', { name: /visit location: address unavailable/i })).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});
