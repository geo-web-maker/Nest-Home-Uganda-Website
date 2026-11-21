import { act, render, screen } from '@testing-library/react';
import { CLIENT_BUILD, markUpgradeRequired, resetUpgradeRequired } from '@shared/lib/api/clientBuild';
import { AppCenterPanel } from './AppCenterPanel';

const mockWebLatest = vi.hoisted(() => ({ value: null as string | null }));

vi.mock('../../admin-native/nativeUpdater', () => ({ NativeUpdater: {} }));
vi.mock('../../admin-native/webBundle', () => ({ WebBundle: {} }));
vi.mock('../../admin-native/appCenter', () => ({
  formatSize: () => '',
  isNewerVersion: (a: string | null, b: string) => a === '9.9.10' && b === '9.9.9',
  useAppCenter: () => ({
    channel: 'browser',
    installed: { channel: 'browser', webVersion: '9.9.9', nativeVersion: null, nativeCode: null, runningBundle: null, stagedBundle: null },
    apk: null,
    apkIsNewer: false,
    bundle: null,
    webLatest: mockWebLatest.value,
    pwa: { supported: true, registered: true, updateReady: false },
    phase: { kind: 'idle' },
    checkedAt: null,
    check: vi.fn(),
    installApk: vi.fn(),
    installBundle: vi.fn(),
    updatePwa: vi.fn(),
  }),
}));

describe('AppCenterPanel and the update requirement', () => {
  beforeEach(() => { resetUpgradeRequired(); mockWebLatest.value = null; });

  it('shows which client build this copy is', () => {
    render(<AppCenterPanel />);
    expect(screen.getByText('Client build')).toBeInTheDocument();
    expect(screen.getByText(String(CLIENT_BUILD))).toBeInTheDocument();
  });

  it('says the latest version is installed while the server has no complaint', () => {
    render(<AppCenterPanel />);
    expect(screen.getByText('You have the latest version.')).toBeInTheDocument();
    expect(screen.queryByText(/server needs a newer version/i)).not.toBeInTheDocument();
  });

  it('warns, and stops saying "latest", once the server answers 426', () => {
    render(<AppCenterPanel />);
    act(() => markUpgradeRequired());
    expect(screen.getByRole('alert')).toHaveTextContent('The server needs a newer version of this app.');
    expect(screen.queryByText('You have the latest version.')).not.toBeInTheDocument();
  });

  it('shows the newest web version and says when it is newer than the one running', () => {
    mockWebLatest.value = '9.9.10';
    render(<AppCenterPanel />);
    expect(screen.getByText('Newest web version')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version 9.9.10 is available' })).toBeInTheDocument();
    expect(screen.queryByText('You have the latest version.')).not.toBeInTheDocument();
  });
});
