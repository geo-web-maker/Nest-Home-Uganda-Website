/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { BUILD_HEADER, CLIENT_BUILD, isUpgradeRequired, markUpgradeRequired, onUpgradeRequired, resetUpgradeRequired } from './clientBuild';

describe('clientBuild', () => {
  beforeEach(() => resetUpgradeRequired());

  it('uses a positive whole build number and the agreed header name', () => {
    expect(Number.isInteger(CLIENT_BUILD)).toBe(true);
    expect(CLIENT_BUILD).toBeGreaterThanOrEqual(1);
    expect(BUILD_HEADER).toBe('X-Client-Build');
  });

  it('tells listeners once the server demands an update, and remembers it', () => {
    const listener = vi.fn();
    onUpgradeRequired(listener);
    expect(isUpgradeRequired()).toBe(false);
    markUpgradeRequired();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isUpgradeRequired()).toBe(true);
  });

  it('stops calling a listener after it unsubscribes', () => {
    const listener = vi.fn();
    const off = onUpgradeRequired(listener);
    off();
    markUpgradeRequired();
    expect(listener).not.toHaveBeenCalled();
  });
});
