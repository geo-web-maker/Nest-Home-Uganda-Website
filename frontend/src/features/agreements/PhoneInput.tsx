import { useState } from 'react';
import { COUNTRIES, joinPhone, splitPhone } from '../../lib/countryCodes';
import styles from './AgreementFieldInput.module.css';

type Props = {
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
};

/** Country-code dropdown plus the number. The stored value is always "+<code><digits>" (or '' when empty). */
export function PhoneInput({ id, value, readOnly, onChange, onCommit }: Props) {
  const [iso, setIso] = useState(() => splitPhone(value).iso);
  const parsed = splitPhone(value, iso);
  // A different country picked from outside (a reload, a saved value) wins over the remembered choice.
  const country = value ? parsed.iso : iso;
  const [national, setNational] = useState(parsed.national);
  const shownNational = value ? parsed.national : national;

  const update = (nextIso: string, nextNational: string, done: boolean) => {
    const joined = joinPhone(nextIso, nextNational);
    onChange(joined);
    if (done) onCommit(joined);
  };

  return (
    <div className={styles.phone}>
      <select
        aria-label="Country code"
        value={country}
        disabled={readOnly}
        onChange={(e) => { setIso(e.target.value); update(e.target.value, shownNational, Boolean(value)); }}
      >
        {COUNTRIES.map((entry) => <option key={entry.iso} value={entry.iso}>{entry.name} (+{entry.dial})</option>)}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        aria-label="Phone number"
        value={shownNational}
        readOnly={readOnly}
        placeholder="771 234 567"
        onChange={(e) => { const digits = e.target.value.replace(/\D/g, ''); setNational(digits); update(country, digits, false); }}
        onBlur={() => update(country, shownNational, true)}
      />
    </div>
  );
}
