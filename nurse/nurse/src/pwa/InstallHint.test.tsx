import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallHint } from './InstallHint';

const desktopChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const safariMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const firefoxWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

const navigatorDescriptors = new Map<string, PropertyDescriptor | undefined>();
function setNavigator(userAgent: string, options: { platform?: string; maxTouchPoints?: number; standalone?: boolean } = {}) {
  const values: Record<string, unknown> = {
    userAgent,
    platform: options.platform ?? (userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('Macintosh') ? 'MacIntel' : 'Win32'),
    maxTouchPoints: options.maxTouchPoints ?? 0,
    standalone: options.standalone ?? false,
    userAgentData: undefined,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!navigatorDescriptors.has(key)) navigatorDescriptors.set(key, Object.getOwnPropertyDescriptor(window.navigator, key));
    Object.defineProperty(window.navigator, key, { configurable: true, value });
  }
}

beforeEach(() => {
  window.localStorage.clear();
  navigatorDescriptors.clear();
});

afterEach(() => {
  for (const [key, descriptor] of navigatorDescriptors) {
    if (descriptor) Object.defineProperty(window.navigator, key, descriptor);
    else Reflect.deleteProperty(window.navigator, key);
  }
  navigatorDescriptors.clear();
  vi.restoreAllMocks();
});

describe('optional install hint UI', () => {
  it('shows iPhone Share → Add to Home Screen instructions', () => {
    setNavigator(iphoneSafari);
    render(<InstallHint />);
    expect(screen.getByRole('complementary', { name: 'Optional app installation help' })).toBeInTheDocument();
    expect(screen.getByText(/Install .* on your iPhone/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap Share in your iPhone browser/i)).toBeInTheDocument();
    expect(screen.getByText('Choose Add to Home Screen', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('shows Chrome/Edge instructions and exposes its native install prompt when available', async () => {
    setNavigator(desktopChrome);
    render(<InstallHint />);
    expect(screen.getByText(/Install .* on this computer/i)).toBeInTheDocument();
    expect(screen.getByText(/Install icon in the address bar/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Install app' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument());
  });

  it('gives other desktop browsers a generic install-menu/bookmark fallback', () => {
    setNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) ExampleBrowser/1.0');
    render(<InstallHint />);
    expect(screen.getByText(/Your browser may offer an install or shortcut option/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows the macOS Safari Add to Dock instruction', () => {
    setNavigator(safariMac);
    render(<InstallHint />);
    expect(screen.getByText(/Add .* to your Mac/i)).toBeInTheDocument();
    expect(screen.getByText(/File → Add to Dock/i)).toBeInTheDocument();
  });

  it('gives Firefox an accurate bookmark/browser-switch fallback', () => {
    setNavigator(firefoxWindows);
    render(<InstallHint />);
    expect(screen.getByText(/Firefox desktop does not provide built-in PWA installation/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  });

  it('shows the guidance only once per browser after its first appearance', () => {
    setNavigator(iphoneSafari);
    const { unmount } = render(<InstallHint />);
    expect(screen.getByRole('complementary', { name: 'Optional app installation help' })).toBeInTheDocument();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument();
  });

  it('dismisses the hint and remembers the choice', () => {
    setNavigator(iphoneSafari);
    const { unmount } = render(<InstallHint />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss installation help' }));
    expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument();
  });

  it('does not suppress the browser-native prompt after the one-time hint has already been seen', () => {
    setNavigator(desktopChrome);
    window.localStorage.setItem('nest.nurse.install-hint-seen.v1', 'true');
    render(<InstallHint />);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument();
  });

  it('does not show the hint in installed standalone mode', () => {
    setNavigator(iphoneSafari, { standalone: true });
    render(<InstallHint />);
    expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument();
  });

  it('hides the guidance after the browser confirms installation', async () => {
    setNavigator(desktopChrome);
    render(<InstallHint />);
    expect(screen.getByRole('complementary', { name: 'Optional app installation help' })).toBeInTheDocument();
    window.dispatchEvent(new Event('appinstalled'));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Optional app installation help' })).not.toBeInTheDocument());
  });
});
