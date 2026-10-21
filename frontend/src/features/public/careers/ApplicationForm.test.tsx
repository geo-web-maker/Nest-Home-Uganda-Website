import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplicationForm } from './ApplicationForm';
const jobs = [
  {
    id: 'job1',
    title: 'Registered Nurse',
    department: 'clinical' as const,
    location: 'Kampala',
    type: 'full_time' as const,
    description: 'client to supply',
    requirements: 'client to supply',
    closes_on: null,
    registration_required: true,
  },
];
function setup() {
  return render(
    <MemoryRouter>
      <ApplicationForm jobs={jobs} selectedJobId="job1" />
    </MemoryRouter>,
  );
}
describe('ApplicationForm', () => {
  it('renders all required applicant fields', () => {
    setup();
    expect(screen.getByLabelText(/^Full name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^CV/)).toBeInTheDocument();
  });
  it('requires a selected CV before submitting', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a CV file.');
  });
  it('rejects a file above the size limit', async () => {
    setup();
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText(/^CV/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The file must be smaller than 5 MB.',
    );
  });
  it('requires professional registration for clinical jobs', async () => {
    setup();
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/^CV/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/professional registration number/);
  });
  it('submits multipart data and announces success', async () => {
    const file = new File(['cv'], 'cv.pdf', { type: 'application/pdf' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
    setup();
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Mary Atim' } });
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '0787 499 988' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'mary@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Professional registration number/), {
      target: { value: 'RN-1' },
    });
    fireEvent.change(screen.getByLabelText(/^Qualification/), { target: { value: 'Nursing' } });
    fireEvent.change(screen.getByLabelText(/^Years of experience/), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/^Area of residence/), { target: { value: 'Kampala' } });
    fireEvent.change(screen.getByLabelText(/^Availability and expected start/), {
      target: { value: 'Immediately' },
    });
    fireEvent.change(screen.getByLabelText(/^CV/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(screen.getByText(/Application received/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
