import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdateNotice } from './UpdateNotice';

describe('application update notice', () => {
  it('blocks with an alert when the installed version is below the required minimum', () => {
    render(<UpdateNotice currentVersion="0.1.0" latestVersion="0.3.0" minimumVersion="0.2.0" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/update before continuing/i)).toBeTruthy();
    expect(screen.getByText(/contact your supervisor/i)).toBeTruthy();
  });

  it('shows a non-blocking notice when only a newer version is available', () => {
    render(<UpdateNotice currentVersion="0.2.0" latestVersion="0.3.0" minimumVersion="0.2.0" downloadPath="/approved-download" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view update/i }).getAttribute('href')).toBe('/approved-download');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
