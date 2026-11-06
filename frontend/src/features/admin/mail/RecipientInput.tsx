import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import { invalidRecipients, parseRecipients } from './recipients';
import styles from './MailPage.module.css';

type Suggestion = { address: string; name?: string | null; source: 'recent' | 'directory' };
type ContactsResponse = { recent: Suggestion[]; directory: Suggestion[] };

interface Props {
  label: string;
  /** Comma-separated list, the same shape the composer already stores. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  /** Addresses already used in the other fields; they are hidden from suggestions. */
  exclude?: readonly string[];
}

/** To/Cc/Bcc field: address chips, live suggestions (recent people first), paste of many addresses at once. */
export function RecipientInput({ label, value, onChange, placeholder, error, exclude = [] }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  // Committed addresses live here; the parent string also carries the text still being typed,
  // so Send reacts to an address as soon as it is complete.
  const lastEmitted = useRef(value);
  const [chips, setChips] = useState(() => parseRecipients(value));
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setChips(parseRecipients(value));
    setDraft('');
  }, [value]);
  const emit = (list: string[], pending: string) => {
    const next = [...list, pending.trim()].filter(Boolean).join(', ');
    lastEmitted.current = next;
    onChange(next);
  };
  const bad = useMemo(() => new Set(invalidRecipients(chips).map((item) => item.toLowerCase())), [chips]);
  const hidden = useMemo(() => new Set([...chips, ...exclude].map((item) => item.toLowerCase())), [chips, exclude]);

  const commit = (text: string) => {
    const added = parseRecipients(text).filter((item) => !chips.some((chip) => chip.toLowerCase() === item.toLowerCase()));
    const next = [...chips, ...added];
    setChips(next);
    setDraft('');
    setActive(0);
    emit(next, '');
  };
  const remove = (list: string[]) => { setChips(list); emit(list, draft); };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiClient.get<ContactsResponse>('/mail/contacts', { params: { q: draft.trim() || undefined }, signal: controller.signal })
        .then((result) => setItems([...result.recent, ...result.directory]))
        .catch(() => { if (!controller.signal.aborted) setItems([]); });
    }, draft.trim() ? 150 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draft, open]);

  const shown = items.filter((item) => !hidden.has(item.address.toLowerCase()));
  const choose = (item: Suggestion) => { commit(item.address); input.current?.focus(); };

  return <div className={styles.recipientField}>
    <label htmlFor={id} className={styles.recipientLabel}>{label}</label>
    <div className={styles.recipientBox} data-invalid={error ? 'true' : undefined} onClick={() => input.current?.focus()}>
      {chips.map((chip) => <span key={chip} className={styles.recipientChip} data-invalid={bad.has(chip.toLowerCase()) ? 'true' : undefined}>
        {chip}
        <Button variant="outline" size="compact" className={styles.recipientRemove} aria-label={`Remove ${chip}`} onClick={(event) => { event.stopPropagation(); remove(chips.filter((item) => item !== chip)); }}>×</Button>
      </span>)}
      <input
        id={id}
        ref={input}
        value={draft}
        placeholder={chips.length ? '' : placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => { window.setTimeout(() => setOpen(false), 120); if (draft.trim()) commit(draft); }}
        onChange={(event) => {
          const text = event.target.value;
          if (/[,;\n]/.test(text)) commit(text); else { setDraft(text); emit(chips, text); }
          setOpen(true);
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (/[,;\s]/.test(text.trim())) { event.preventDefault(); commit(text.replace(/\s+/g, ',')); }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((current) => Math.min(shown.length - 1, current + 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
          else if (event.key === 'Escape') setOpen(false);
          else if (event.key === 'Enter' || event.key === 'Tab') {
            if (open && shown[active] && !draft.includes('@')) { event.preventDefault(); choose(shown[active]!); }
            else if (draft.trim()) { event.preventDefault(); commit(draft); }
          } else if (event.key === 'Backspace' && !draft && chips.length) remove(chips.slice(0, -1));
        }}
      />
    </div>
    {open && shown.length ? <ul id={listId} role="listbox" className={styles.recipientMenu}>
      {shown.map((item, index) => <li key={item.address} role="option" aria-selected={index === active} data-active={index === active ? 'true' : undefined}
        onMouseDown={(event) => { event.preventDefault(); choose(item); }} onMouseEnter={() => setActive(index)}>
        <strong>{item.name || item.address}</strong>{item.name ? <span>{item.address}</span> : null}
        <em>{item.source === 'recent' ? 'Recent' : 'Directory'}</em>
      </li>)}
    </ul> : null}
    {error ? <p role="alert" className={styles.recipientError}>{error}</p> : null}
  </div>;
}
