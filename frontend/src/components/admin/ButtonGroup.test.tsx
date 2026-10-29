import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Button, ButtonSizeProvider } from '../ui/Button';
import { ButtonGroup } from './ButtonGroup';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ButtonGroup', () => {
  it('draws its buttons at the control size by default', () => {
    wrap(
      <ButtonGroup>
        <Button>Save</Button>
        <Button variant="outline">Cancel</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('data-size', 'control');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-size', 'control');
  });

  it('draws row actions compact, and links too', () => {
    wrap(
      <ButtonGroup size="compact">
        <Button variant="outline">Review</Button>
        <Button variant="outline" href="/admin/care/visits/1">
          Open
        </Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('data-size', 'compact');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('data-size', 'compact');
  });

  it('wins over the size the page inherited, so a dialog footer is not shrunk by a table above it', () => {
    wrap(
      <ButtonSizeProvider value="compact">
        <ButtonGroup>
          <Button>Confirm</Button>
        </ButtonGroup>
      </ButtonSizeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute('data-size', 'control');
  });

  it('lets a single Button still choose its own size', () => {
    wrap(
      <ButtonGroup>
        <Button size="compact">Small</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('data-size', 'compact');
  });

  it('keeps children in order inside one wrapper', () => {
    const { container } = wrap(
      <ButtonGroup align="end" spaced>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>,
    );
    const group = container.firstElementChild as HTMLElement;
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['One', 'Two']);
  });
});
