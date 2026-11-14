import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { LegacyAdminRedirect } from './LegacyAdminRedirect';

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

describe('legacy admin browser route', () => {
  it('redirects the old prefixed URL while preserving query and hash', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/care/clients?x=1#h']}>
        <Routes>
          <Route path="admin/*" element={<LegacyAdminRedirect />} />
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/care/clients?x=1#h');
  });
});
