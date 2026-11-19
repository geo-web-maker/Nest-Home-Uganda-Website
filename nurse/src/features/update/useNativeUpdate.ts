/**
 * Downloads and installs an APK update via the NativeUpdaterPlugin.
 * On web/PWA the hook is a no-op.
 */
import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeUpdater } from '../../plugins/NativeUpdater';

export type NativeUpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; pct: number }
  | { status: 'installing' }
  | { status: 'error'; message: string };

export function useNativeUpdate() {
  const [state, setState] = useState<NativeUpdateState>({ status: 'idle' });
  const isNative = Capacitor.isNativePlatform();

  const start = useCallback(
    async (opts: { url: string; sha256?: string | null; version: string }) => {
      if (!isNative) return;
      setState({ status: 'downloading', pct: 0 });
      try {
        await NativeUpdater.downloadAndInstall(
          {
            url: opts.url,
            sha256: opts.sha256,
            fileName: `nest-nurse-${opts.version}.apk`,
          },
          (event) => {
            if (event.type === 'progress') {
              const pct = event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0;
              setState({ status: 'downloading', pct });
            } else if (event.type === 'done') {
              setState({ status: 'installing' });
            }
          },
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message });
      }
    },
    [isNative],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, reset, isNative };
}
