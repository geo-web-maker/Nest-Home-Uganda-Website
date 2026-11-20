import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  current: vi.fn(), download: vi.fn(), stage: vi.fn(), applyStaged: vi.fn(), confirm: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));

import { stageWebBundleUpdate } from './webBundle';

describe('stageWebBundleUpdate', () => {
  beforeEach(() => {
    vi.stubGlobal('__BUNDLE_VERSION__', '1.0.0');
    Object.values(plugin).forEach((fn) => fn.mockReset());
    plugin.current.mockResolvedValue({ running: '', staged: '', bad: '', nativeCode: 7 });
    plugin.download.mockResolvedValue({ version: '1.1.0' });
  });

  it('asks the API with the embedded version and the APK build, then stages the download', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ update: true, version: '1.1.0', url: 'https://x/b.zip', sha256: 'a'.repeat(64) }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await stageWebBundleUpdate('nurse')).toBe('staged');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/app-bundles/nurse/latest?native_code=7&current=1.0.0');
    expect(plugin.stage).toHaveBeenCalledWith({ version: '1.1.0' });
  });

  it('does nothing when no update is offered, one is already staged, or the version failed before', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ update: false }) }));
    expect(await stageWebBundleUpdate('nurse')).toBe('none');
    plugin.current.mockResolvedValue({ running: '', staged: '1.1.0', bad: '', nativeCode: 7 });
    expect(await stageWebBundleUpdate('nurse')).toBe('none');
    plugin.current.mockResolvedValue({ running: '', staged: '', bad: '1.1.0', nativeCode: 7 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ update: true, version: '1.1.0', url: 'https://x', sha256: 'a'.repeat(64) }) }));
    expect(await stageWebBundleUpdate('nurse')).toBe('none');
    expect(plugin.download).not.toHaveBeenCalled();
  });
});
