import { Field } from '../../../../components/ui/Field';
import { Button } from '../../../../components/ui/Button';
import { ButtonGroup } from '../../../../components/admin/ButtonGroup';
type Row = Record<string, unknown>;
type Props = {
  clientId: string; setClientId: (value: string) => void; busy: boolean;
  message: string; exportedData: Row | null;
  onExport: () => void;
  onAnonymise: () => void;
};

export function DataToolsPanel(props: Props) {
  return <section className="care-form" aria-labelledby="care-data-title">
    <h2 id="care-data-title">Data subject tools</h2>
    <p>Use only after confirming the requester&apos;s identity and authority. Every export and anonymisation action is audited.</p>
    <Field label="Client ID" required requiredLabel="required" maxLength={160} value={props.clientId} onChange={(event) => props.setClientId(event.target.value)} />
    <ButtonGroup spaced>
      <Button type="button" variant="outline" onClick={props.onExport} disabled={props.busy || !props.clientId.trim()}>{props.busy ? 'Working' : 'Export client data'}</Button>
      <Button type="button" variant="outline" className="care-danger-button" onClick={props.onAnonymise} disabled={props.busy || !props.clientId.trim()}>Anonymise client</Button>
    </ButtonGroup>
    {props.message && <p role="status">{props.message}</p>}
    {props.exportedData && <pre className="care-data-export">{JSON.stringify(props.exportedData, null, 2)}</pre>}
  </section>;
}
