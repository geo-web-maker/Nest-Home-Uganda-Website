import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CARE_SCREEN_PATHS, CARE_SCREEN_SCOPES, CareScreenPage } from './CareScreenPage';

const careMocks = vi.hoisted(() => ({
  user: { scopes: ['timesheets:read'] as string[], is_superadmin: false },
  get: vi.fn(),
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: careMocks.user, status: 'signedIn' }),
}));
vi.mock('../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/client')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: careMocks.get,
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

describe('Track D care routes', () => {
  it('declares every Track D screen and its read scope', () => {
    expect(Object.keys(CARE_SCREEN_PATHS)).toEqual(
      expect.arrayContaining([
        'nurses',
        'clients',
        'places',
        'visits',
        'flags',
        'team',
        'photos',
        'alerts',
        'timesheets',
        'sos',
        'reports',
        'settings',
        'readiness',
        'data',
        'audit',
      ]),
    );
    for (const key of Object.keys(CARE_SCREEN_PATHS))
      expect(CARE_SCREEN_SCOPES[key as keyof typeof CARE_SCREEN_SCOPES].length).toBeGreaterThan(0);
  });
});


describe('care mutation scope boundaries', () => {
  beforeEach(() => {
    careMocks.user.scopes = ['timesheets:read'];
    careMocks.user.is_superadmin = false;
    careMocks.get.mockReset();
    careMocks.get.mockResolvedValue([
      {
        id: 'timesheet-000001',
        status: 'submitted',
        period_start: '2026-10-19',
        period_end: '2026-10-25',
        completed_visits: 4,
        total_minutes: 480,
      },
    ]);
  });

  it('allows viewing timesheets but hides review and adjustment actions without timesheets:write', async () => {
    render(
      <MemoryRouter>
        <CareScreenPage screen="timesheets" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('table', { name: 'Timesheets table' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument();
  });

  it('shows timesheet review actions only when timesheets:write is present', async () => {
    careMocks.user.scopes = ['timesheets:read', 'timesheets:write'];
    render(
      <MemoryRouter>
        <CareScreenPage screen="timesheets" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeInTheDocument();
  });
});
