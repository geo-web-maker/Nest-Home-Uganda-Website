import { registerPlugin } from '@capacitor/core';

export interface DownloadProgress {
  type: 'progress';
  loaded: number;
  total: number;
}
export interface DownloadDone {
  type: 'done';
}

export interface NativeUpdaterPlugin {
  /** Installed APK versionName and versionCode. */
  getInfo(): Promise<{ versionName: string; versionCode: number }>;
  /**
   * Download an APK and launch the system installer.
   * The callback fires with DownloadProgress events during the download,
   * then a final DownloadDone when the installer has been launched.
   */
  downloadAndInstall(
    options: { url: string; sha256?: string | null; fileName: string },
    callback: (event: DownloadProgress | DownloadDone, err?: unknown) => void,
  ): Promise<string>; // returns listener handle
}

export const NativeUpdater = registerPlugin<NativeUpdaterPlugin>('NativeUpdater');
