import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button } from './Button';

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Button', () => {
  it('renders a button element with type button when there is no href', async () => {
    const onClick = vi.fn();
    renderInRouter(<Button onClick={onClick}>Save</Button>);
    const el = screen.getByRole('button', { name: 'Save' });
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('allows type submit for forms', () => {
    renderInRouter(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it('renders a router link for internal paths', () => {
    renderInRouter(<Button href="/contact">Book a home visit</Button>);
    const el = screen.getByRole('link', { name: 'Book a home visit' });
    expect(el).toHaveAttribute('href', '/contact');
  });

  it('renders a plain anchor for tel and wa.me links', () => {
    renderInRouter(
      <>
        <Button href="tel:+256787499988" variant="outline">
          Call
        </Button>
        <Button href="https://wa.me/256787499988" variant="whatsapp">
          WhatsApp us
        </Button>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+256787499988');
    const wa = screen.getByRole('link', { name: 'WhatsApp us' });
    expect(wa).toHaveAttribute('href', 'https://wa.me/256787499988');
    expect(wa).toHaveAttribute('data-variant', 'whatsapp');
  });

  it('does not pass styling props to the DOM', () => {
    renderInRouter(
      <Button fullWidth size="header">
        Go
      </Button>,
    );
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el).not.toHaveAttribute('fullwidth');
    expect(el).not.toHaveAttribute('size');
  });

  it('defaults to the primary variant', () => {
    renderInRouter(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary');
  });
});
