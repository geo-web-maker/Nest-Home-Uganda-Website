import type { ReactNode } from 'react';
import { copy } from '../../copy';
import { Card } from '../../ui/Card';
import { PillButton } from '../../ui/PillButton';

type DisclosureItem = { label: ReactNode; text: string };
type Props = { title: string; text?: string; items?: DisclosureItem[]; onAccept: () => void; disabled?: boolean; showAction?: boolean };
export function Disclosure({ title, text, items = [], onAccept, disabled = false, showAction = true }: Props) {
  return <Card className="disclosure-card" aria-labelledby="location-disclosure-title">
    <p className="eyebrow">{title}</p>
    {items.length ? <div className="disclosure-items">{items.map((item, index) => <div className="disclosure-item" key={index}><strong>{item.label}</strong><p>{item.text}</p></div>)}</div> : <p>{text}</p>}
    {showAction && <PillButton type="button" tone="gold" size="full" disabled={disabled} onClick={onAccept}>{copy.disclosure.accept}</PillButton>}
  </Card>;
}
