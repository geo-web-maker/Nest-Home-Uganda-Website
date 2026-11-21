import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@shared/lib/api/client';
import { AppBuildsPanel, plannedVersion } from './AppBuildsPanel';
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

const versions = { apps: {
  nurse: { current: '1.0.0', current_apk: '1.0.0', current_web: null, next: { apk: '2.0.0', web: '1.0.1' } },
  admin: { current: '1.4.2', current_apk: '1.0.0', current_web: '1.4.2', next: { apk: '2.0.0', web: '1.4.3' } },
} };
const serve = (items: BuildRun[]) => vi.mocked(apiClient.get).mockImplementation(async (url: string) => (
  url.endsWith('/builds/versions') ? versions : { repo: 'a/b', items }) as never);

describe('plannedVersion', () => {
  it('gives the server-assigned number for the kind of build', () => {
    expect(plannedVersion('apk', versions.apps.nurse)).toBe('2.0.0');
    expect(plannedVersion('web', versions.apps.admin)).toBe('1.4.3');
  });
  it('is empty when nothing is chosen, unknown, or the web counter is full', () => {
    expect(plannedVersion('none', versions.apps.nurse)).toBeNull();
    expect(plannedVersion('web', undefined)).toBeNull();
    expect(plannedVersion('web', { ...versions.apps.nurse, next: { apk: '2.0.0', web: null } })).toBeNull();
  });
});

describe('AppBuildsPanel', () => {
  it('still lets you choose a build when the current versions cannot be loaded', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.endsWith('/builds/versions')) throw new Error('Not found');
      return { repo: 'a/b', items: [] } as never;
    });
    renderPanel();
    const radio = await screen.findByLabelText('Web update', { selector: 'input[name="kind-nurse"]' });
    await userEvent.click(radio);
    expect(radio).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start build' })).toBeEnabled();
  });

  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('lists recent builds with a plain-words status and a GitHub link', async () => {
    serve([run(), run({ id: 2, tag: 'admin-v1.0.0', state: 'failed' })]);
    renderPanel();
    expect(await screen.findByText('nurse-v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/Failed/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open on GitHub' })[0]).toHaveAttribute('href', 'https://github.com/a/b/actions/runs/1');
  });

  it('says when a build is in progress', async () => {
    serve([run({ state: 'running' })]);
    renderPanel();
    expect(await screen.findByText(/A build is in progress/)).toBeInTheDocument();
  });

  it('shows the server message when GitHub is not set up', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('GitHub is not set up.'));
    renderPanel();
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('GitHub is not set up');
  });

  it('shows the number each build will get, with no version to type', async () => {
    serve([]);
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Android app for both' }));
    expect(screen.getAllByText('2.0.0')).toHaveLength(2);
    expect(screen.queryByLabelText(/app version/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Web update for both' }));
    expect(screen.getByText('1.0.1')).toBeInTheDocument();
    expect(screen.getByText('1.4.3')).toBeInTheDocument();
  });

  it('blocks a web update when the 99.99 counter is full', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => (
      url.endsWith('/builds/versions')
        ? { apps: { ...versions.apps, nurse: { ...versions.apps.nurse, next: { apk: '2.0.0', web: null } } } }
        : { repo: 'a/b', items: [] }) as never);
    renderPanel();
    await userEvent.click(await screen.findByLabelText('Web update', { selector: 'input[name="kind-nurse"]' }));
    expect(screen.getByRole('alert')).toHaveTextContent('counter is full');
    expect(screen.getByRole('button', { name: 'Start build' })).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('starts several builds in one request', async () => {
    serve([]);
    vi.mocked(apiClient.post).mockResolvedValue({ items: [
      { target: 'nurse-web', tag: 'nurse-web-v1.0.1', version: '1.0.1', ok: true, error: null },
      { target: 'admin-web', tag: 'admin-web-v1.4.3', version: '1.4.3', ok: true, error: null },
    ] });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Web update for both' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start 2 builds' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/app-releases/builds/batch', { items: [
      { target: 'nurse-web', version: '1.0.1' }, { target: 'admin-web', version: '1.4.3' },
    ] }));
    expect(await screen.findByText(/Build started for admin-web-v1.4.3/)).toBeInTheDocument();
  });

  it('shows why a build could not start', async () => {
    serve([]);
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Nurse app: the next web update is 1.0.1, not 1.0.0.'));
    renderPanel();
    await userEvent.click(await screen.findByLabelText('Web update', { selector: 'input[name="kind-nurse"]' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start build' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('the next web update is 1.0.1');
  });
});
