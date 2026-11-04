/** App dialogs: promise-based replacements for window.confirm / prompt / alert.
 *  <DialogHost /> (mounted once in the admin layout) shows them; with no host mounted
 *  (for example in unit tests) they fall back to the browser dialogs. */
export type ChoiceOption = { value: string; label: string };

export type DialogRequest =
  | { kind: 'confirm'; message: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { kind: 'choose'; message: string; options: ChoiceOption[]; allowBlank: string | null; resolve: (v: string | null) => void }
  | { kind: 'alert'; message: string; resolve: () => void };

let host: ((request: DialogRequest) => void) | null = null;

export function registerDialogHost(fn: ((request: DialogRequest) => void) | null): () => void {
  host = fn;
  return () => {
    if (host === fn) host = null;
  };
}

export const dialogs = {
  confirm(message: string): Promise<boolean> {
    if (!host) return Promise.resolve(window.confirm(message));
    return new Promise((resolve) => host!({ kind: 'confirm', message, resolve }));
  },
  prompt(message: string, defaultValue = ''): Promise<string | null> {
    if (!host) return Promise.resolve(window.prompt(message, defaultValue));
    return new Promise((resolve) => host!({ kind: 'prompt', message, defaultValue, resolve }));
  },
  /** Pick one option from a list. Resolves the value, '' for the blank choice, null if cancelled. */
  choose(message: string, options: ChoiceOption[], allowBlank: string | null = null): Promise<string | null> {
    if (!host) return Promise.resolve(window.prompt(message));
    return new Promise((resolve) => host!({ kind: 'choose', message, options, allowBlank, resolve }));
  },
  alert(message: string): Promise<void> {
    if (!host) {
      window.alert(message);
      return Promise.resolve();
    }
    return new Promise((resolve) => host!({ kind: 'alert', message, resolve }));
  },
};
