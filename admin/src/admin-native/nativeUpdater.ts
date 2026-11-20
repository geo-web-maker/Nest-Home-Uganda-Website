import { registerPlugin } from '@capacitor/core';

export interface DownloadProgress { type: 'progress'; loaded: number; total: number }
export interface DownloadDone { type: 'done' }

interface NativeUpdaterPlugin {
  getInfo(): Promise<{ versionName: string; versionCode: number }>;
  downloadAndInstall(
    options: { url: string; sha256?: string | null; fileName: string },
    callback: (event: DownloadProgress | DownloadDone, err?: unknown) => void,
  ): Promise<string>;
}

export const NativeUpdater = registerPlugin<NativeUpdaterPlugin>('NativeUpdater');
