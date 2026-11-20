import { markUpgradeRequired, resetUpgradeRequired } from '@shared/lib/api/clientBuild';
import { installUpgradeRequiredHandler, recoverFromUpgradeRequired, type UpgradeDeps } from './upgradeRequired';

function makeDeps(seen: Record<string, string> = {}) {
  const calls: string[] = [];
  const deps: UpgradeDeps = {
    storage: { getItem: (key) => seen[key] ?? null, setItem: (key, value) => { seen[key] = value; } },
    unregisterWorkers: async () => { calls.push('unregister'); },
    clearCaches: async () => { calls.push('caches'); },
    reload: () => { calls.push('reload'); },
  };
  return { deps, calls, seen };
}

describe('recoverFromUpgradeRequired', () => {
  beforeEach(() => resetUpgradeRequired());

  it('clears the worker and caches, then reloads, in that order', async () => {
    const { deps, calls } = makeDeps();
    await expect(recoverFromUpgradeRequired(deps)).resolves.toBe(true);
    expect(calls).toEqual(['unregister', 'caches', 'reload']);
  });

  it('reloads only once per session so a second 426 cannot loop', async () => {
    const { deps, calls } = makeDeps();
    await recoverFromUpgradeRequired(deps);
    await expect(recoverFromUpgradeRequired(deps)).resolves.toBe(false);
    expect(calls.filter((call) => call === 'reload')).toHaveLength(1);
  });

  it('still reloads when clearing the caches fails', async () => {
    const { deps, calls } = makeDeps();
    deps.clearCaches = async () => { throw new Error('denied'); };
    await expect(recoverFromUpgradeRequired(deps)).resolves.toBe(true);
    expect(calls).toContain('reload');
  });

  it('never reloads when storage is unavailable', async () => {
    const { deps, calls } = makeDeps();
    deps.storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    await expect(recoverFromUpgradeRequired(deps)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('installUpgradeRequiredHandler', () => {
  beforeEach(() => resetUpgradeRequired());

  it('reacts to the signal and stops after it is removed', async () => {
    const first = makeDeps();
    const stop = installUpgradeRequiredHandler(first.deps);
    markUpgradeRequired();
    await vi.waitFor(() => expect(first.calls).toContain('reload'));
    stop();
    const second = makeDeps();
    const stopSecond = installUpgradeRequiredHandler(second.deps);
    stopSecond();
    resetUpgradeRequired();
    markUpgradeRequired();
    expect(second.calls).toEqual([]);
  });
});
