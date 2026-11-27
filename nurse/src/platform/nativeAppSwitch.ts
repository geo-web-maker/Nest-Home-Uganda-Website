/** Native bridge wrapper. Keep byte-identical to admin/src/admin-native/nativeAppSwitch.ts. */
import { Capacitor, registerPlugin } from '@capacitor/core';

type AppSwitchPluginApi = {
  isInstalled(options: { package: string }): Promise<{ installed: boolean }>;
  launch(options: { package: string; scheme: string; code: string }): Promise<{ launched: boolean }>;
  requestHandoff(options: { package: string; scheme: string; challenge: string; returnScheme: string }): Promise<{ launched: boolean }>;
};

const AppSwitch = registerPlugin<AppSwitchPluginApi>('AppSwitch');

export function isNativeAppSwitchAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppSwitch');
}

export async function isOtherAppInstalled(packageName: string): Promise<boolean> {
  if (!isNativeAppSwitchAvailable()) return false;
  const result = await AppSwitch.isInstalled({ package: packageName });
  return Boolean(result.installed);
}

export async function launchOtherApp(packageName: string, scheme: string, code = ''): Promise<boolean> {
  if (!isNativeAppSwitchAvailable()) return false;
  await AppSwitch.launch({ package: packageName, scheme, code });
  return true;
}

export async function requestOtherAppHandoff(packageName: string, scheme: string, challenge: string, returnScheme: string): Promise<boolean> {
  if (!isNativeAppSwitchAvailable()) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error('The sign-in challenge is invalid.');
  await AppSwitch.requestHandoff({ package: packageName, scheme, challenge, returnScheme });
  return true;
}

/** Accept only the one custom URL belonging to the app receiving the handoff. */
export function readNativeHandoffCode(url: string, currentApp: 'admin' | 'nurse'): string | null {
  const scheme = `nhc-${currentApp}`;
  const match = new RegExp(`^${scheme}://handoff\\?code=([A-Za-z0-9_-]{20,100})$`).exec(url);
  return match?.[1] ?? null;
}

/** Parse a PKCE pull request addressed to this app; the return scheme must belong to the caller. */
export function readNativeHandoffRequest(url: string, currentApp: 'admin' | 'nurse'): { challenge: string; returnApp: 'admin' | 'nurse' } | null {
  const scheme = `nhc-${currentApp}`;
  const match = new RegExp(`^${scheme}://request-handoff\\?challenge=([A-Za-z0-9_-]{43})&return_scheme=nhc-(admin|nurse)$`).exec(url);
  if (!match || match[2] === currentApp) return null;
  return { challenge: match[1], returnApp: match[2] as 'admin' | 'nurse' };
}
