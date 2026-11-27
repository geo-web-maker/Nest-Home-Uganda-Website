/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { FilterBar } from '../../../../components/admin/FilterBar';
import { CareFormsCopyLog } from '../settings/CareFormsCopyLog';

type Setting = Record<string, any>;
type Readiness = Record<string, any> | null;

/** Editable care configuration list; saving and refresh remain owned by CareScreenContent. */
export function CareSettingsPanel({
  settings,
  canWrite,
  canRead,
  onSave,
}: {
  settings: Setting[];
  canWrite: boolean;
  canRead: boolean;
  onSave: (id: string, value: any) => Promise<void>;
}) {
  return (
    <div className="care-settings">
      {settings.map((setting) => (
        <form
          key={setting.id}
          className="care-setting"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canWrite) return;
            const input = event.currentTarget.elements.namedItem('value') as HTMLInputElement;
            let value: any = input.value;
            if (setting.type === 'boolean') value = input.checked;
            if (setting.type === 'integer') value = Number(input.value);
            await onSave(setting.id, value);
          }}
        >
          <Field
            label={setting.id}
            name="value"
            defaultValue={setting.type === 'boolean' ? undefined : setting.value}
            type={setting.type === 'integer' ? 'number' : 'text'}
            disabled={!canWrite}
          />
          {setting.type === 'boolean' && (
            <Checkbox
              label={`${setting.id} enabled`}
              hideLabel
              name="value"
              defaultChecked={Boolean(setting.value)}
              disabled={!canWrite}
            />
          )}
          <small>Source: {setting.source}; group: {setting.group}</small>
          {canWrite && <Button type="submit">Save</Button>}
        </form>
      ))}
      {canRead && <CareFormsCopyLog />}
    </div>
  );
}

/** Compact readiness checklist, kept independent from the multi-screen care coordinator. */
export function CareReadinessPanel({ readiness }: { readiness: Readiness }) {
  return (
    <div className="care-readiness">
      <strong>{readiness?.ready ? 'Ready' : 'Not ready'}</strong>
      {(readiness?.items ?? []).map((item: any) => (
        <div key={item.id} className="care-check">
          <b>{item.status}</b>
          <span>{item.label}</span>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </div>
  );
}

/** Client data export form; the parent owns the audited request and result state. */
export function CareDataRequestPanel({
  clientId,
  selected,
  onClientIdChange,
  onPreview,
}: {
  clientId: string;
  selected: Record<string, any> | null;
  onClientIdChange: (value: string) => void;
  onPreview: () => void;
}) {
  return (
    <>
      <FilterBar
        label="Client data export"
        onSubmit={onPreview}
        actions={<Button type="submit">Preview export</Button>}
      >
        <Field label="Client ID" value={clientId} onChange={(event) => onClientIdChange(event.target.value)} />
      </FilterBar>
      {selected && <pre className="care-data-export">{JSON.stringify(selected, null, 2)}</pre>}
    </>
  );
}
