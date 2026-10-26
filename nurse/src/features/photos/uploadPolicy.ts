export type ConnectionInfo = { type?: string } | undefined;

/** Unknown connection types fail closed when Wi-Fi-only uploads are requested. */
export function canUploadPhoto(wifiOnly: boolean, online: boolean, connection?: ConnectionInfo): boolean {
  if (!online) return false;
  if (!wifiOnly) return true;
  return connection?.type?.toLowerCase() === 'wifi';
}
