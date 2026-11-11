import { render, screen } from '@testing-library/react';
import { AccentText } from './AccentText';

describe('AccentText', () => {
  it('renders the phrase inside an em element within a heading', () => {
    render(
      <h1>
        Care that <AccentText>comes home</AccentText> to you.
      </h1>,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Care that comes home to you.');
    expect(screen.getByText('comes home').tagName).toBe('EM');
  });
});
