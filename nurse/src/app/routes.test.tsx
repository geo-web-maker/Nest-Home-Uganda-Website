import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NurseRoutes, type NurseRouteViews } from './routes';

const views: NurseRouteViews = {
  login: <h2>Login view</h2>,
  today: <h2>Today view</h2>,
  onboarding: <h2>Onboarding view</h2>,
  history: <h2>History view</h2>,
  profile: <h2>Profile view</h2>,
  sync: <h2>Sync view</h2>,
  visit: (id) => <h2>Visit {id}</h2>,
  activeVisit: (id) => <h2>Active {id}</h2>,
};

function renderRoute(path: string, authenticated = true) {
  return render(<MemoryRouter initialEntries={[path]}><NurseRoutes views={views} authenticated={authenticated} /></MemoryRouter>);
}

describe('nurse route table', () => {
  it('routes authenticated tabs and visit detail paths', () => {
    const { unmount } = renderRoute('/history');
    expect(screen.getByRole('heading', { name: 'History view' })).toBeTruthy();
    unmount();
    renderRoute('/visit/visit-123');
    expect(screen.getByRole('heading', { name: 'Visit visit-123' })).toBeTruthy();
  });

  it('routes an active visit separately and protects authenticated routes', () => {
    const { unmount } = renderRoute('/active/visit-456');
    expect(screen.getByRole('heading', { name: 'Active visit-456' })).toBeTruthy();
    unmount();
    renderRoute('/profile', false);
    expect(screen.getByRole('heading', { name: 'Login view' })).toBeTruthy();
  });

  it('redirects unknown paths to the root route', () => {
    renderRoute('/not-a-route');
    expect(screen.getByRole('heading', { name: 'Today view' })).toBeTruthy();
  });
});
