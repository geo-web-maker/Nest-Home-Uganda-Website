import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@shared/lib/api/client';
import { ReleaseChecksSection } from './ReleaseChecksSection';

vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

const result = (checks: { id: string; status: string; detail: string }[]) => ({
  checks,
  summary: {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    skip: checks.filter((c) => c.status === 'skip').length,
  },
});

describe('ReleaseChecksSection', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('says ready when everything passes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(result([{ id: 'release_key_on_backend', status: 'pass', detail: 'Set.' }]));
    render(<ReleaseChecksSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Run release checks' }));
    expect(await screen.findByText(/Ready to build/)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/admin/app-releases/preflight', {});
  });

  it('blocks and lists what to fix, in words not colour alone', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(result([
      { id: 'github_variables', status: 'fail', detail: 'VITE_API_URL is missing.' },
      { id: 'github_secrets', status: 'skip', detail: 'Cannot list.' },
    ]));
    render(<ReleaseChecksSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Run release checks' }));
    expect(await screen.findByText(/Not ready: 1 to fix first/)).toBeInTheDocument();
    expect(screen.getByText('FIX')).toBeInTheDocument();
    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(screen.getByText('VITE_API_URL is missing.')).toBeInTheDocument();
  });

  it('shows warnings as ready with things to look at', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(result([{ id: 'nurse_version', status: 'warn', detail: 'Tag exists.' }]));
    render(<ReleaseChecksSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Run release checks' }));
    expect(await screen.findByText(/Ready, with 1 thing to look at/)).toBeInTheDocument();
  });

  it('shows the error when the checks cannot run', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Enter your authenticator code.'));
    render(<ReleaseChecksSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Run release checks' }));
    expect(await screen.findByText('Enter your authenticator code.')).toBeInTheDocument();
  });
});
