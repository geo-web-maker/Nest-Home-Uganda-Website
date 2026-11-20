import { isUpgradeRequired, onUpgradeRequired } from '@shared/lib/api/clientBuild';

const RELOADED_KEY = 'admin_upgrade_reloaded';

export type UpgradeDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  unregisterWorkers: () => Promise<void>;
  clearCaches: () => Promise<void>;
  reload: () => void;
};

const browserDeps = (): UpgradeDeps => ({
  storage: sessionStorage,
  unregisterWorkers: async () => {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  },
  clearCaches: async () => {
    if (typeof caches === 'undefined') return;
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  },
  reload: () => window.location.reload(),
});

/**
 * The server said this copy is too old (HTTP 426). Drop the service worker and its caches and
 * reload once per browser session, so a stale installed web app fetches the current files. A
 * second 426 in the same session does not loop: the App Center then shows the update notice.
 * Returns true when it reloaded.
 */
export async function recoverFromUpgradeRequired(deps: UpgradeDeps = browserDeps()): Promise<boolean> {
  try {
    if (deps.storage.getItem(RELOADED_KEY)) return false;
    deps.storage.setItem(RELOADED_KEY, '1');
  } catch {
    return false; // no storage means no way to prevent a loop, so never reload
  }
  try {
    await deps.unregisterWorkers();
    await deps.clearCaches();
  } catch {
    /* reload anyway */
  }
  deps.reload();
  return true;
}

/** Start reacting to 426 answers. Returns the function that stops it. */
export function installUpgradeRequiredHandler(deps?: UpgradeDeps): () => void {
  const run = () => void recoverFromUpgradeRequired(deps);
  if (isUpgradeRequired()) run();
  return onUpgradeRequired(run);
}
