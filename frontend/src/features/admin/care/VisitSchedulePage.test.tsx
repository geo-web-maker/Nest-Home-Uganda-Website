import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/client';
import { VisitSchedulePage } from './VisitSchedulePage';

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: '1', name: 'Root', email: 'r@x.test', scopes: ['visits:read'], is_superadmin: false } }),
}));
vi.mock('../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ items: [] } as never);
});

describe('VisitSchedulePage toolbar', () => {
  it('keeps the view switch, date stepper and range label together in one toolbar', async () => {
    render(
      <MemoryRouter>
        <VisitSchedulePage />
      </MemoryRouter>,
    );
    const toolbar = (await screen.findByRole('group', { name: 'Schedule view' })).parentElement as HTMLElement;
    expect(toolbar).toHaveClass('stage-toolbar--schedule');
    expect(toolbar.querySelector('.stage-date-navigation')).not.toBeNull();
    expect(toolbar.querySelectorAll('.stage-nav-arrow')).toHaveLength(2);
    expect(toolbar.querySelector('.stage-range-label')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });
});
