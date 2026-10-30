/**
 * Decide which optional PWA-install hint is useful for the current browser.
 * Installed apps and mobile/tablet platforms other than iPhone deliberately
 * receive no hint: the nurse Android app has its own native install path.
 */
export type InstallGuidanceKind =
  | 'iphone'
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'desktop-other'
  | null;

export type InstallGuidanceEnvironment = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayModeStandalone?: boolean;
};

export function detectInstallGuidance({
  userAgent,
  platform = '',
  maxTouchPoints = 0,
  standalone = false,
  displayModeStandalone = false,
}: InstallGuidanceEnvironment): InstallGuidanceKind {
  if (standalone || displayModeStandalone) return null;

  const ua = userAgent.toLowerCase();
  const platformName = platform.toLowerCase();

  // iPhone is checked before browser identity so Safari, Chrome, Edge and
  // Firefox on iOS all receive the correct Share-sheet instructions.
  if (/iphone/.test(ua)) return 'iphone';

  // Do not label iPads as desktop computers. iPadOS can report a Mac platform
  // and a desktop-style user agent, so touch capability is part of the check.
  if (/ipad|ipod|android|mobile|tablet/.test(ua)) return null;
  if (maxTouchPoints > 1 && /macintosh|macintel/.test(`${ua} ${platformName}`)) return null;

  const looksLikeDesktop =
    /windows nt|macintosh|x11|linux x86_64|cros|win32|macintel|linux arm/.test(`${ua} ${platformName}`);
  if (!looksLikeDesktop) return null;

  if (/edg\//.test(ua) || /(?:chrome|chromium)\//.test(ua) || /opr\//.test(ua)) {
    return 'desktop-chromium';
  }
  if (/firefox\//.test(ua)) return 'desktop-firefox';
  if (/safari\//.test(ua) && /macintosh|mac os x|macintel/.test(`${ua} ${platformName}`)) {
    return 'desktop-safari';
  }

  return 'desktop-other';
}

export const INSTALL_HINT_SEEN_KEY = 'nest.nurse.install-hint-seen.v1';

export function hasSeenInstallHint(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(INSTALL_HINT_SEEN_KEY) === 'true';
  } catch {
    // Storage can be disabled in private browsing or by device policy.
    return false;
  }
}

export function persistInstallHintSeen(storage: Pick<Storage, 'setItem'> | null | undefined): void {
  try {
    storage?.setItem(INSTALL_HINT_SEEN_KEY, 'true');
  } catch {
    // The current component state still dismisses the hint without storage.
  }
}
