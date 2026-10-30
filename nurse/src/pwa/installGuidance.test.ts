import { describe, expect, it } from 'vitest';
import {
  detectInstallGuidance,
  hasSeenInstallHint,
  INSTALL_HINT_SEEN_KEY,
  persistInstallHintSeen,
} from './installGuidance';

const chromeWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const safariMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const firefoxWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.0.0 Mobile/15E148 Safari/604.1';

describe('device-aware PWA installation guidance detection', () => {
  it('shows iPhone guidance regardless of the iOS browser engine label', () => {
    expect(detectInstallGuidance({ userAgent: iphoneChrome, platform: 'iPhone' })).toBe('iphone');
  });

  it('recognises desktop Chromium browsers', () => {
    expect(detectInstallGuidance({ userAgent: chromeWindows, platform: 'Win32' })).toBe('desktop-chromium');
    expect(detectInstallGuidance({ userAgent: chromeWindows.replace('Chrome/', 'Edg/'), platform: 'Win32' })).toBe('desktop-chromium');
  });

  it('recognises desktop Safari and Firefox separately', () => {
    expect(detectInstallGuidance({ userAgent: safariMac, platform: 'MacIntel' })).toBe('desktop-safari');
    expect(detectInstallGuidance({ userAgent: firefoxWindows, platform: 'Win32' })).toBe('desktop-firefox');
  });

  it('falls back to generic desktop guidance for other computer browsers', () => {
    expect(detectInstallGuidance({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ExampleBrowser/1.0', platform: 'Win32' })).toBe('desktop-other');
  });

  it('does not show desktop guidance on iPad, Android, or other mobile devices', () => {
    expect(detectInstallGuidance({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBeNull();
    expect(detectInstallGuidance({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', platform: 'Linux armv8l' })).toBeNull();
  });

  it('never shows install guidance when the app is already installed', () => {
    expect(detectInstallGuidance({ userAgent: iphoneChrome, standalone: true })).toBeNull();
    expect(detectInstallGuidance({ userAgent: chromeWindows, displayModeStandalone: true })).toBeNull();
  });

  it('does not guess a desktop when the browser provides no desktop platform signal', () => {
    expect(detectInstallGuidance({ userAgent: 'Mozilla/5.0 jsdom' })).toBeNull();
  });
});

describe('one-time install hint persistence', () => {
  it('persists the first display under a versioned browser-local key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(hasSeenInstallHint(storage)).toBe(false);
    persistInstallHintSeen(storage);
    expect(values.get(INSTALL_HINT_SEEN_KEY)).toBe('true');
    expect(hasSeenInstallHint(storage)).toBe(true);
  });

  it('fails open when browser storage is unavailable', () => {
    const throwingStorage = {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage denied'); },
    };
    expect(hasSeenInstallHint(throwingStorage)).toBe(false);
    expect(() => persistInstallHintSeen(throwingStorage)).not.toThrow();
  });
});
