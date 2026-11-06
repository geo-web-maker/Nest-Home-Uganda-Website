/** App dialogs: promise-based replacements for window.confirm / prompt / alert.
 *  <DialogHost /> (mounted once in the admin layout) shows them; with no host mounted
 *  (for example in unit tests) they fall back to the browser dialogs.
 *
 *  Keep them light: ask for everything in ONE dialog, validate while the person types (the OK
 *  button stays off until the answer is acceptable) and name the button after the action. */
export type ChoiceOption = { value: string; label: string };

export type ConfirmOptions = {
  /** Button text, for example "Delete" or "Revoke" instead of the generic "Confirm". */
  confirmLabel?: string;
};

export type PromptOptions = {
  /** Fewest characters (after trimming) before OK turns on. Implies the answer is required. */
  minLength?: number;
  /** Shows a larger multi-line box; Ctrl/⌘+Enter submits. */
  multiline?: boolean;
  /** Hides what is typed, for passwords. */
  secret?: boolean;
  placeholder?: string;
  confirmLabel?: string;
};

export type FormField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea';
  minLength?: number;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

export type DialogRequest =
  | { kind: 'confirm'; message: string; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'form'; message: string; fields: FormField[]; confirmLabel: string; resolve: (v: Record<string, string> | null) => void }
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
  confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    if (!host) return Promise.resolve(window.confirm(message));
    return new Promise((resolve) => host!({ kind: 'confirm', message, options, resolve }));
  },
  prompt(message: string, defaultValue = '', options: PromptOptions = {}): Promise<string | null> {
    if (!host) return Promise.resolve(window.prompt(message, defaultValue));
    return new Promise((resolve) => host!({ kind: 'prompt', message, defaultValue, options, resolve }));
  },
  /** Several answers in one dialog. Resolves a map of field name to value, or null if cancelled. */
  form(message: string, fields: FormField[], confirmLabel = 'Save'): Promise<Record<string, string> | null> {
    if (!host) {
      // Browser fallback: ask each field in turn.
      const answers: Record<string, string> = {};
      for (const field of fields) {
        const value = window.prompt(`${message}\n${field.label}`, field.defaultValue ?? '');
        if (value === null) return Promise.resolve(null);
        answers[field.name] = value;
      }
      return Promise.resolve(answers);
    }
    return new Promise((resolve) => host!({ kind: 'form', message, fields, confirmLabel, resolve }));
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
