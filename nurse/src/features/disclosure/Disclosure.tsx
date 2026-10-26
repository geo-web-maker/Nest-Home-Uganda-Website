import { copy } from '../../copy';

type Props = { title: string; text: string; onAccept: () => void; disabled?: boolean };
export function Disclosure({ title, text, onAccept, disabled = false }: Props) {
  return <section className="panel" aria-labelledby="location-disclosure-title"><h2 id="location-disclosure-title">{title}</h2><p>{text}</p><button type="button" disabled={disabled} onClick={onAccept}>{copy.disclosure.accept}</button></section>;
}
