import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button, ButtonSizeProvider } from './Button';

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

  it('renders a decorative arrow without changing the accessible name', () => {
    renderInRouter(<Button href="/contact" arrow>Book a home visit</Button>);
    const button = screen.getByRole('link', { name: 'Book a home visit' });
    expect(button.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
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

  describe('size', () => {
    it('is the marketing size unless something above says otherwise', () => {
      renderInRouter(<Button>Go</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('data-size', 'default');
    });

    it.each(['header', 'control', 'compact'] as const)('accepts the %s size on a button and on a link', (size) => {
      renderInRouter(
        <>
          <Button size={size}>Act</Button>
          <Button size={size} href="/admin">
            Open
          </Button>
        </>,
      );
      expect(screen.getByRole('button', { name: 'Act' })).toHaveAttribute('data-size', size);
      expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('data-size', size);
    });

    it('takes the size set by ButtonSizeProvider, for buttons, links and nested content', () => {
      renderInRouter(
        <ButtonSizeProvider value="control">
          <div>
            <Button>Save</Button>
            <Button href="https://example.test/x">Docs</Button>
          </div>
        </ButtonSizeProvider>,
      );
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('data-size', 'control');
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('data-size', 'control');
    });

    it('lets one Button override the provider, and the nearest provider wins', () => {
      renderInRouter(
        <ButtonSizeProvider value="control">
          <Button size="compact">Small</Button>
          <ButtonSizeProvider value="compact">
            <Button>Inner</Button>
          </ButtonSizeProvider>
        </ButtonSizeProvider>,
      );
      expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('data-size', 'compact');
      expect(screen.getByRole('button', { name: 'Inner' })).toHaveAttribute('data-size', 'compact');
    });

    it('does not pass size on to the DOM element', () => {
      renderInRouter(<Button size="control">Go</Button>);
      expect(screen.getByRole('button')).not.toHaveAttribute('size');
    });
  });
});
