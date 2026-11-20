import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@shared/lib/api/client';
import { AppBuildsPanel } from './AppBuildsPanel';
import type { BuildRun } from './AppBuildsPanel';

vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

const run = (over: Partial<BuildRun> = {}): BuildRun => ({
  id: 1, run_number: 5, tag: 'nurse-v1.0.0', name: 'Nurse release', state: 'succeeded',
  created_at: '2026-11-20T08:00:00Z', updated_at: '2026-11-20T08:12:00Z', url: 'https://github.com/a/b/actions/runs/1',
  ...over,
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><AppBuildsPanel /></QueryClientProvider></MemoryRouter>);
}

describe('AppBuildsPanel', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('lists recent builds with a plain-words status and a GitHub link', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ repo: 'a/b', items: [run(), run({ id: 2, tag: 'admin-v1.0.0', state: 'failed' })] });
    renderPanel();
    expect(await screen.findByText('nurse-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/Failed/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open on GitHub' })[0]).toHaveAttribute('href', 'https://github.com/a/b/actions/runs/1');
  });

  it('says when a build is in progress', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ repo: 'a/b', items: [run({ state: 'running' })] });
    renderPanel();
    expect(await screen.findByText(/A build is in progress/)).toBeInTheDocument();
    expect(screen.getByText(/Building/)).toBeInTheDocument();
  });

  it('shows the server message when GitHub is not set up', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('GitHub is not set up. Set NEST_GITHUB_REPO and NEST_GITHUB_TOKEN on the backend.'));
    renderPanel();
    expect(await screen.findByText(/GitHub is not set up/)).toBeInTheDocument();
  });

  it('rejects a bad version without calling the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ repo: 'a/b', items: [] });
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/Version/), '1.0');
    await userEvent.click(screen.getByRole('button', { name: 'Start build' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('three numbers');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('starts the chosen build and reports the tag', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ repo: 'a/b', items: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ tag: 'admin-web-v1.0.1' });
    renderPanel();
    await userEvent.selectOptions(await screen.findByLabelText('What to build'), 'admin-web');
    await userEvent.type(screen.getByLabelText(/Version/), '1.0.1');
    await userEvent.click(screen.getByRole('button', { name: 'Start build' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/app-releases/builds', { target: 'admin-web', version: '1.0.1' }));
    expect(await screen.findByText(/Build started for admin-web-v1.0.1/)).toBeInTheDocument();
  });

  it('shows why a build could not start', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ repo: 'a/b', items: [] });
    vi.mocked(apiClient.post).mockRejectedValue(new Error('nurse/package.json on main says 0.9.0, not 1.0.0.'));
    renderPanel();
    await userEvent.type(await screen.findByLabelText(/Version/), '1.0.0');
    await userEvent.click(screen.getByRole('button', { name: 'Start build' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('says 0.9.0');
  });
});
