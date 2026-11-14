/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { registerDialogHost, type DialogRequest, type FormField } from '../../lib/dialogs';
import { Button } from '../ui/Button';
import { ButtonGroup } from './ButtonGroup';
import { Modal } from './Modal';

const fieldStyle = { width: '100%', padding: '0.6rem 0.8rem', marginBottom: '0.75rem', font: 'inherit' } as const;
const hintStyle = { margin: '-0.25rem 0 0.75rem', fontSize: '0.875rem', opacity: 0.75 } as const;

function fieldIsValid(field: FormField, value: string): boolean {
  const trimmed = value.trim();
  if (field.type === 'number' && trimmed !== '' && !Number.isFinite(Number(trimmed))) return false;
  if (field.minLength) return trimmed.length >= field.minLength;
  return field.required ? trimmed !== '' : true;
}

/** Shows the app's own confirm / prompt / form / alert dialogs, one at a time. */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [text, setText] = useState('');
  const [reveal, setReveal] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const current = queue[0];

  useEffect(() => registerDialogHost((request) => setQueue((q) => [...q, request])), []);
  useEffect(() => {
    setText(current?.kind === 'prompt' ? current.defaultValue : '');
    setValues(current?.kind === 'form' ? Object.fromEntries(current.fields.map((field) => [field.name, field.defaultValue ?? ''])) : {});
  }, [current]);

  if (!current) return null;
  const finish = (value: boolean | string | Record<string, string> | null) => {
    if (current.kind === 'confirm') current.resolve(Boolean(value));
    else if (current.kind === 'prompt' || current.kind === 'choose') current.resolve(typeof value === 'string' ? value : null);
    else if (current.kind === 'form') current.resolve(value && typeof value === 'object' ? value : null);
    else current.resolve();
    setQueue((q) => q.slice(1));
  };
  const cancel = () => finish(current.kind === 'confirm' ? false : null);
  const title = current.kind === 'alert' ? 'Notice' : current.kind === 'confirm' ? 'Please confirm' : current.kind === 'choose' ? 'Choose one' : current.kind === 'form' ? 'Enter details' : 'Enter a value';
  const submitOnCtrlEnter = (submit: () => void) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  if (current.kind === 'choose') {
    return (
      <Modal id="app-dialog-title" title={title} subtitle={current.message} onClose={cancel} closeLabel="Cancel">
        <form onSubmit={(event) => { event.preventDefault(); finish(text); }}>
          <select
            autoFocus
            aria-label={current.message}
            value={text}
            onChange={(event) => setText(event.target.value)}
            style={{ width: '100%', padding: '0.6rem 0.8rem', marginBottom: '1rem', font: 'inherit' }}
          >
            <option value="" disabled={current.allowBlank === null}>
              {current.allowBlank ?? 'Select…'}
            </option>
            {current.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ButtonGroup>
            <Button type="submit" disabled={current.allowBlank === null && !text}>OK</Button>
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          </ButtonGroup>
        </form>
      </Modal>
    );
  }

  if (current.kind === 'prompt') {
    const { minLength = 0, multiline = false, secret = false, placeholder, confirmLabel = 'OK' } = current.options;
    const valid = minLength > 0 ? text.trim().length >= minLength : true;
    const submit = () => { if (valid) finish(text); };
    return (
      <Modal id="app-dialog-title" title={title} subtitle={current.message} onClose={cancel} closeLabel="Cancel">
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          {multiline ? (
            <textarea
              autoFocus
              rows={4}
              aria-label={current.message}
              placeholder={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={submitOnCtrlEnter(submit)}
              style={fieldStyle}
            />
          ) : (
            <input
              autoFocus
              type={secret && !reveal ? 'password' : 'text'}
              autoComplete={secret ? 'new-password' : 'off'}
              aria-label={current.message}
              placeholder={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              style={fieldStyle}
            />
          )}
          {secret ? (
            <Button type="button" variant="outline" size="compact" aria-pressed={reveal} onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Show'}
            </Button>
          ) : null}
          {minLength > 0 && !valid ? <p style={hintStyle}>At least {minLength} characters ({text.trim().length} so far).</p> : null}
          <ButtonGroup>
            <Button type="submit" disabled={!valid}>{confirmLabel}</Button>
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          </ButtonGroup>
        </form>
      </Modal>
    );
  }

  if (current.kind === 'form') {
    const allValid = current.fields.every((field) => fieldIsValid(field, values[field.name] ?? ''));
    const submit = () => { if (allValid) finish(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))); };
    return (
      <Modal id="app-dialog-title" title={title} subtitle={current.message} onClose={cancel} closeLabel="Cancel">
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          {current.fields.map((field, index) => {
            const common = {
              id: `app-dialog-${field.name}`,
              autoFocus: index === 0,
              placeholder: field.placeholder,
              value: values[field.name] ?? '',
              style: fieldStyle,
            };
            return (
              <div key={field.name}>
                <label htmlFor={common.id}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea {...common} rows={3} onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))} onKeyDown={submitOnCtrlEnter(submit)} />
                ) : (
                  <input {...common} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))} />
                )}
              </div>
            );
          })}
          <ButtonGroup>
            <Button type="submit" disabled={!allValid}>{current.confirmLabel}</Button>
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          </ButtonGroup>
        </form>
      </Modal>
    );
  }

  const confirmLabel = current.kind === 'confirm' ? current.options.confirmLabel ?? 'Confirm' : 'OK';
  return (
    <Modal id="app-dialog-title" title={title} subtitle={current.message} onClose={cancel} closeLabel="Cancel" role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'}>
      <ButtonGroup>
        <Button type="button" autoFocus onClick={() => finish(true)}>{confirmLabel}</Button>
        {current.kind === 'confirm' && <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>}
      </ButtonGroup>
    </Modal>
  );
}
