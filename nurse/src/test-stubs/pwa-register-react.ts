/** Vitest stand-in for the virtual module that vite-plugin-pwa provides only in a real build. */
const noop = () => {};
export function useRegisterSW() {
  return { needRefresh: [false, noop] as const, offlineReady: [false, noop] as const, updateServiceWorker: async () => {} };
}
