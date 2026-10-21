import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Accordion } from './Accordion';

const items = [
  { id: 'a', summary: 'How quickly can care start?', content: 'Usually within a day or two.' },
  { id: 'b', summary: 'What if I need to cancel?', content: 'Add the cancellation wording here.' },
];

describe('Accordion', () => {
  it('renders one native details row per item, closed by default', () => {
    const { container } = render(<Accordion items={items} />);
    const rows = container.querySelectorAll('details');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row).not.toHaveAttribute('open'));
    expect(screen.getByText('How quickly can care start?').tagName).toBe('SUMMARY');
  });

  it('opens a row when its summary is clicked and closes it on a second click', async () => {
    const { container } = render(<Accordion items={items} />);
    const first = container.querySelector('details');
    await userEvent.click(screen.getByText('How quickly can care start?'));
    expect(first).toHaveAttribute('open');
    await userEvent.click(screen.getByText('How quickly can care start?'));
    expect(first).not.toHaveAttribute('open');
  });

  it('makes each summary reachable with the Tab key', async () => {
    render(<Accordion items={items} />);
    await userEvent.tab();
    expect(screen.getByText('How quickly can care start?')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText('What if I need to cancel?')).toHaveFocus();
    // Enter and Space activation is native browser behaviour that jsdom does not
    // implement. It is covered by the Playwright flows in S6.
  });

  it('keeps answers in the document for search engines', () => {
    render(<Accordion items={items} />);
    expect(screen.getByText('Usually within a day or two.')).toBeInTheDocument();
  });
});
