import { copy } from '../../copy';

type DisclosureItem = { label: string; text: string };
type Props = { title: string; text?: string; items?: DisclosureItem[]; onAccept: () => void; disabled?: boolean; showAction?: boolean };
export function Disclosure({ title, text, items = [], onAccept, disabled = false, showAction = true }: Props) {
  return <section className="panel disclosure-card" aria-labelledby="location-disclosure-title">
    <p className="eyebrow">{title}</p>
    {items.length ? <div className="disclosure-items">{items.map((item) => <div className="disclosure-item" key={item.label}><strong>{item.label}</strong><p>{item.text}</p></div>)}</div> : <p>{text}</p>}
    {showAction && <button type="button" disabled={disabled} onClick={onAccept}>{copy.disclosure.accept}</button>}
  </section>;
}
