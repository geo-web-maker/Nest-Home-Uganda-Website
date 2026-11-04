import { useEffect, useState } from 'react';
import { registerDialogHost, type DialogRequest } from '../../lib/dialogs';
import { Button } from '../ui/Button';
import { ButtonGroup } from './ButtonGroup';
import { Modal } from './Modal';

/** Shows the app's own confirm / prompt / alert dialogs, one at a time. */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [text, setText] = useState('');
  const current = queue[0];

  useEffect(() => registerDialogHost((request) => setQueue((q) => [...q, request])), []);
  useEffect(() => {
    setText(current?.kind === 'prompt' ? current.defaultValue : current?.kind === 'choose' && current.allowBlank !== null ? '' : '');
  }, [current]);

  if (!current) return null;
  const finish = (value: boolean | string | null) => {
    if (current.kind === 'confirm') current.resolve(Boolean(value));
    else if (current.kind === 'prompt' || current.kind === 'choose') current.resolve(typeof value === 'string' ? value : null);
    else current.resolve();
    setQueue((q) => q.slice(1));
  };
  const cancel = () => finish(current.kind === 'prompt' || current.kind === 'choose' ? null : false);
  const title = current.kind === 'alert' ? 'Notice' : current.kind === 'confirm' ? 'Please confirm' : current.kind === 'choose' ? 'Choose one' : 'Enter a value';

  return (
    <Modal id="app-dialog-title" title={title} subtitle={current.message} onClose={cancel} closeLabel="Cancel">
      {current.kind === 'choose' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            finish(text);
          }}
        >
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
      ) : current.kind === 'prompt' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            finish(text);
          }}
        >
          <input
            autoFocus
            aria-label={current.message}
            value={text}
            onChange={(event) => setText(event.target.value)}
            style={{ width: '100%', padding: '0.6rem 0.8rem', marginBottom: '1rem', font: 'inherit' }}
          />
          <ButtonGroup>
            <Button type="submit">OK</Button>
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          </ButtonGroup>
        </form>
      ) : (
        <ButtonGroup>
          <Button type="button" onClick={() => finish(true)}>{current.kind === 'confirm' ? 'Confirm' : 'OK'}</Button>
          {current.kind === 'confirm' && <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>}
        </ButtonGroup>
      )}
    </Modal>
  );
}
