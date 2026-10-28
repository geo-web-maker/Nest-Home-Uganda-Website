import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { bookingCopyEn as copy } from '../../../locales/en/booking';
import { BookingError } from './bookingApi';
import type { BookingResult } from './bookingApi';
import { BookingForm } from './BookingForm';
import type { BookingFormProps } from './BookingForm';
import type { BookingPayload } from './bookingSchema';

const FIRST_ID = 'a'.repeat(24);
const SECOND_ID = 'b'.repeat(24);
const SERVICES = [
  { id: FIRST_ID, name: 'Postnatal care' },
  { id: SECOND_ID, name: 'Physiotherapy' },
];
const RESULT: BookingResult = {
  reference: 'NHC-000007',
  whatsappUrl: 'https://wa.me/256787499988?text=Hello',
};

function setup(overrides: Partial<BookingFormProps> = {}) {
  const submit = vi.fn<(p: BookingPayload) => Promise<BookingResult>>().mockResolvedValue(RESULT);
  render(
    <MemoryRouter>
      <BookingForm
        copy={copy}
        services={SERVICES}
        whatsappDigits="256787499988"
        callHref="tel:+256787499988"
        submit={submit}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { submit, user: userEvent.setup() };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Your name/), 'Mary Atim');
  await user.type(screen.getByLabelText(/Phone number/), '0787 499 988');
  await user.selectOptions(screen.getByLabelText(/Who needs care/), 'parent');
  await user.click(screen.getByRole('button', { name: 'Postnatal care' }));
  await user.type(screen.getByLabelText(/^Area/), 'Ntinda');
  await user.click(screen.getByRole('checkbox'));
}

describe('BookingForm', () => {
  it('shows the medical-details warning and requires explicit contact consent', async () => {
    const { submit, user } = setup();
    expect(screen.getByText('Please do not enter medical details here')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /I agree that Well Nest Home Care Uganda may contact me/ }),
    ).not.toBeChecked();

    await user.type(screen.getByLabelText(/Your name/), 'Mary Atim');
    await user.type(screen.getByLabelText(/Phone number/), '0787 499 988');
    await user.selectOptions(screen.getByLabelText(/Who needs care/), 'parent');
    await user.click(screen.getByRole('button', { name: 'Postnatal care' }));
    await user.type(screen.getByLabelText(/^Area/), 'Ntinda');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(copy.errors.consent)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows the plain WhatsApp button first with the spec text', () => {
    setup();
    const link = screen.getByRole('link', { name: 'Chat on WhatsApp' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('text=Hello%20Well%20Nest%20Home%20Care%20Uganda%2C%20I%20would%20like%20to%20ask'),
    );
  });

  it('pre-selects the service from a service page', () => {
    setup({ preselectedServiceIds: [SECOND_ID] });
    expect(screen.getByRole('button', { name: 'Physiotherapy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Postnatal care' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('announces every error, focuses the first invalid field and sends nothing', async () => {
    const { submit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const alerts = await screen.findAllByRole('alert');
    const text = alerts.map((a) => a.textContent).join(' | ');
    expect(text).toContain(copy.errors.name);
    expect(text).toContain(copy.errors.phone);
    expect(text).toContain(copy.errors.services);
    expect(text).toContain(copy.errors.consent);
    await waitFor(() => expect(screen.getByLabelText(/Your name/)).toHaveFocus());
    expect(submit).not.toHaveBeenCalled();
  });

  it('cannot submit without a care chip', async () => {
    const { submit, user } = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Postnatal care' })); // untick
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(copy.errors.services)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses a link in the name and a non-Uganda phone', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/Your name/), 'visit www.spam.com');
    await user.type(screen.getByLabelText(/Phone number/), '+254787499988');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(copy.errors.nameLink)).toBeInTheDocument();
    expect(screen.getByText(copy.errors.phone)).toBeInTheDocument();
  });

  it('sends a clean payload, then shows the thank-you with focus, the link and the reference', async () => {
    const { submit, user } = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    const heading = await screen.findByRole('heading', { name: copy.thanksHeading });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Mary Atim',
      phone: '0787 499 988',
      relationship: 'parent',
      service_ids: [FIRST_ID],
      area: 'Ntinda',
      consent: true,
      website: '',
    });
    expect(screen.getByRole('link', { name: 'Continue on WhatsApp' })).toHaveAttribute(
      'href',
      RESULT.whatsappUrl,
    );
    expect(screen.getByText('Your request reference is NHC-000007.')).toBeInTheDocument();
  });

  it('opens WhatsApp itself only when the setting is on', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const on = setup({ openWhatsappAfter: true });
    await fillValid(on.user);
    await on.user.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('heading', { name: copy.thanksHeading });
    expect(open).toHaveBeenCalledWith(RESULT.whatsappUrl, '_blank', 'noopener');
    expect(screen.getByRole('link', { name: 'Continue on WhatsApp' })).toBeInTheDocument();
    open.mockRestore();
  });

  it('keeps what was typed and offers Call and WhatsApp when sending fails', async () => {
    const submit = vi.fn().mockRejectedValue(new BookingError('failed'));
    const { user } = setup({ submit });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(copy.sendFailed)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Mary Atim');
    expect(screen.getByRole('link', { name: 'Call now' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
    expect(screen.getAllByRole('link', { name: 'Chat on WhatsApp' }).length).toBeGreaterThan(1);
  });

  it('shows the rate-limit message', async () => {
    const submit = vi.fn().mockRejectedValue(new BookingError('rate_limited'));
    const { user } = setup({ submit });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(copy.rateLimited)).toBeInTheDocument();
  });

  it('puts server field errors on the matching field', async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(new BookingError('validation', { phone: 'Enter a valid Uganda phone.' }));
    const { user } = setup({ submit });
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Enter a valid Uganda phone.')).toBeInTheDocument();
  });

  it('keeps the honeypot out of the accessibility tree and sends what a bot types in it', async () => {
    const { submit, user } = setup();
    const trap = screen.getByLabelText(copy.honeypotLabel, { selector: 'input' });
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap).toHaveAttribute('tabindex', '-1');
    await fillValid(user);
    await user.type(trap, 'http://bot.example');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]?.[0]?.website).toBe('http://bot.example');
  });
});
