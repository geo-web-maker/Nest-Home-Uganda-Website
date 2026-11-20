import { useSyncExternalStore } from 'react';
import { isUpgradeRequired, onUpgradeRequired } from '@shared/lib/api/clientBuild';

/** True once the server has said this copy of the app is too old (HTTP 426). */
export function useUpgradeRequired(): boolean {
  return useSyncExternalStore(onUpgradeRequired, isUpgradeRequired, () => false);
}
