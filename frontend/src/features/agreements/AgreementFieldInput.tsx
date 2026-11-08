import { useId, useState } from 'react';
import { cleanMoney, fieldMeta, formatMoney, isIsoDate } from './fieldMeta';
import { PhoneInput } from './PhoneInput';
import styles from './AgreementFieldInput.module.css';

type Props = {
  path: string;
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  /** Called when a value is finished (blur, picking an option, toggling N/A). */
  onCommit?: (value: string) => void;
  currency?: string;
  allowNA?: boolean;
};

const NA = 'N/A';

export function AgreementFieldInput({ path, id, value, readOnly, onChange, onCommit, currency = 'UGX', allowNA = false }: Props) {
  const meta = fieldMeta(path);
  const listId = useId();
  const titleOptions = meta.options ?? [];
  const [titleOther, setTitleOther] = useState(false);
  const canNA = allowNA && meta.na !== false && !readOnly;
  const commit = (next: string) => onCommit?.(next);
  const set = (next: string, done = false) => { onChange(next); if (done) commit(next); };

  if (value === NA && (canNA || (meta.kind !== 'long' && meta.kind !== 'text'))) {
    return (
      <div className={styles.na}>
        <span>Not applicable</span>
        {canNA && <button type="button" onClick={() => set('', true)}>Enter a value</button>}
      </div>
    );
  }

  const naButton = canNA && !value
    ? <button type="button" className={styles.naButton} onClick={() => set(NA, true)}>Mark N/A</button>
    : null;

  let control;
  switch (meta.kind) {
    case 'money': {
      const shown = formatMoney(value);
      control = (
        <>
          <div className={styles.affix}>
            <span aria-hidden="true">{currency}</span>
            <input id={id} inputMode="decimal" autoComplete="off" value={value} readOnly={readOnly} placeholder="0"
              aria-describedby={`${id}-hint`}
              onChange={(e) => onChange(cleanMoney(e.target.value))} onBlur={() => commit(value)} />
          </div>
          <small id={`${id}-hint`} className={value && !shown ? styles.bad : styles.hint}>
            {value && !shown ? 'Enter a number like 1500000 or 1500000.50.' : shown ? `${currency} ${shown}` : 'Digits only, no commas.'}
          </small>
        </>
      );
      break;
    }
    case 'int':
      control = <input id={id} inputMode="numeric" autoComplete="off" value={value} readOnly={readOnly} placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => commit(value)} />;
      break;
    case 'date': {
      const valid = value === '' || isIsoDate(value);
      control = valid
        ? <input id={id} type="date" value={value} readOnly={readOnly} disabled={readOnly}
            onChange={(e) => set(e.target.value, true)} />
        : <><input id={id} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} onBlur={() => commit(value)} />
            <small className={styles.hint}>Saved as text. Pick a date to replace it.
              {!readOnly && <button type="button" className={styles.link} onClick={() => set('', false)}>Clear</button>}</small></>;
      break;
    }
    case 'select': {
      const options = meta.options ?? [];
      const unknown = value && !options.includes(value);
      control = (
        <select id={id} value={value || meta.defaultOption || ''} disabled={readOnly} onChange={(e) => set(e.target.value, true)}>
          <option value="">Select…</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
          {unknown && <option value={value}>{value} (current)</option>}
        </select>
      );
      break;
    }
    case 'title': {
      // A printed title (Mr, Mrs, Miss, Dr) or "Other", which opens a box to type any other title.
      const custom = value !== '' && value !== NA && !titleOptions.includes(value);
      const other = titleOther || custom;
      control = (
        <>
          <select id={id} value={other ? '__other' : value} disabled={readOnly}
            onChange={(e) => {
              if (e.target.value === '__other') { setTitleOther(true); set('', false); return; }
              setTitleOther(false);
              set(e.target.value, true);
            }}>
            <option value="">No title</option>
            {titleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            <option value="__other">Other…</option>
          </select>
          {other && (
            <>
              <input value={value} readOnly={readOnly} placeholder="Type the title, e.g. Prof" aria-label="Other title"
                list={meta.suggestions ? listId : undefined} autoFocus={!custom}
                onChange={(e) => onChange(e.target.value)} onBlur={() => commit(value)} />
              {meta.suggestions && <datalist id={listId}>{meta.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
            </>
          )}
        </>
      );
      break;
    }
    case 'phone':
      control = <PhoneInput id={id} value={value} readOnly={readOnly} onChange={onChange} onCommit={commit} />;
      break;
    case 'email':
      control = <input id={id} type="email" inputMode="email" autoComplete="off" value={value} readOnly={readOnly} placeholder="name@example.com"
        onChange={(e) => onChange(e.target.value)} onBlur={() => commit(value)} />;
      break;
    case 'initials':
      control = <input id={id} className={styles.initials} value={value} readOnly={readOnly} maxLength={6} placeholder="AB" autoCapitalize="characters"
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z.\- ]/g, ''))} onBlur={() => commit(value)} />;
      break;
    case 'long':
      control = <textarea id={id} rows={3} value={value} readOnly={readOnly} placeholder={meta.placeholder}
        onChange={(e) => onChange(e.target.value)} onBlur={() => commit(value)} />;
      break;
    default:
      control = (
        <>
          <input id={id} value={value} readOnly={readOnly} placeholder={meta.placeholder} list={meta.suggestions ? listId : undefined}
            onChange={(e) => onChange(e.target.value)} onBlur={() => commit(value)} />
          {meta.suggestions && <datalist id={listId}>{meta.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </>
      );
  }

  return <div className={styles.wrap}>{control}{naButton}</div>;
}
