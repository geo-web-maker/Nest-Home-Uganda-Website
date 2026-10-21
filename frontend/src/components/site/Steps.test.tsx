import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Steps } from './Steps';

const items = [
  { id: 'one', number: '1', title: 'Call us', text: 'Tell us who needs care.' },
  { id: 'two', number: '2', title: 'Agree a plan', text: 'We set out what care is needed.' },
  { id: 'three', number: '3', title: 'Care at home', text: 'Your nurse arrives in uniform.' },
];

describe('Steps', () => {
  it('renders all step headings and text', () => {
    render(<Steps items={items} label="How it works" />);
    expect(screen.getByText('Agree a plan')).toBeInTheDocument();
    expect(screen.getByText('Your nurse arrives in uniform.')).toBeInTheDocument();
  });
  it('exposes the ordered list with its label', () => {
    render(<Steps items={items} label="How it works" />);
    expect(screen.getByRole('list', { name: 'How it works' })).toBeInTheDocument();
  });
  it('hides the decorative number from the accessibility tree', () => {
    render(<Steps items={items.slice(0, 1)} label="How it works" />);
    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true');
  });
  it('draws one connector between each pair of steps and none after the last', () => {
    const { container } = render(<Steps items={items} label="How it works" />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3 + 2);
  });
  it('renders no connector for a single step', () => {
    const { container } = render(<Steps items={items.slice(0, 1)} label="How it works" />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });
});
