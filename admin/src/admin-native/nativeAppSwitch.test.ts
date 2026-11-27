import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
  registerPlugin: () => ({}),
}));

import { readNativeHandoffCode, readNativeHandoffRequest } from './nativeAppSwitch';

describe('native cross-app URL parsing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a request addressed to this app and a known return app', () => {
    const challenge = 'A'.repeat(43);
    expect(readNativeHandoffRequest(`nhc-admin://request-handoff?challenge=${challenge}&return_scheme=nhc-nurse`, 'admin'))
      .toEqual({ challenge, returnApp: 'nurse' });
  });

  it('rejects a request that routes back to the same app', () => {
    const challenge = 'A'.repeat(43);
    expect(readNativeHandoffRequest(`nhc-nurse://request-handoff?challenge=${challenge}&return_scheme=nhc-nurse`, 'nurse')).toBeNull();
  });

  it('rejects malformed, reordered or untrusted request parameters', () => {
    const challenge = 'A'.repeat(43);
    expect(readNativeHandoffRequest(`nhc-admin://request-handoff?challenge=${challenge}&return_scheme=nhc-evil`, 'admin')).toBeNull();
    expect(readNativeHandoffRequest(`nhc-admin://request-handoff?return_scheme=nhc-nurse&challenge=${challenge}`, 'admin')).toBeNull();
    expect(readNativeHandoffRequest('nhc-admin://request-handoff?challenge=short&return_scheme=nhc-nurse', 'admin')).toBeNull();
  });

  it('accepts only short, opaque handoff codes for the selected app', () => {
    const code = 'Abcdefghijklmnopqrstuv_123456789';
    expect(readNativeHandoffCode(`nhc-nurse://handoff?code=${code}`, 'nurse')).toBe(code);
    expect(readNativeHandoffCode(`nhc-admin://handoff?code=${code}`, 'nurse')).toBeNull();
    expect(readNativeHandoffCode(`nhc-nurse://handoff?code=${code}&extra=1`, 'nurse')).toBeNull();
  });
});
