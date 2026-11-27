import { Button } from '@shared/components/ui/Button';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { cellText, headerFor } from '@shared/lib/tableText';
import { CARE_TABS_WITH_ACTIONS, type CareTab } from './careWorkspaceConfig';

export type CareRecordRow = Record<string, unknown>;

type CareRecordsTableProps = {
  tab: CareTab;
  items: CareRecordRow[];
  caption: string;
  onReviewVisit: (item: CareRecordRow) => void;
  onReassignVisit: (item: CareRecordRow) => void;
  onCancelVisit: (item: CareRecordRow) => void;
  onSelectFlag: (item: CareRecordRow) => void;
  onHidePhoto: (item: CareRecordRow) => void;
  onAcknowledgeAlert: (item: CareRecordRow) => void;
  onResolveAlert: (item: CareRecordRow) => void;
  onApproveTimesheet: (item: CareRecordRow) => void;
  onSendBackTimesheet: (item: CareRecordRow) => void;
  onAcknowledgeSos: (item: CareRecordRow) => void;
};

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const hiddenColumns = ['_id', 'created_at', 'updated_at', 'place_snapshot', 'details'];

/** Presentation-only records table. Permission checks, prompts and mutations stay with CareWorkspace. */
export function CareRecordsTable({
  tab,
  items,
  caption,
  onReviewVisit,
  onReassignVisit,
  onCancelVisit,
  onSelectFlag,
  onHidePhoto,
  onAcknowledgeAlert,
  onResolveAlert,
  onApproveTimesheet,
  onSendBackTimesheet,
  onAcknowledgeSos,
}: CareRecordsTableProps) {
  const columns = Object.keys(items[0] ?? {}).filter((key) => !hiddenColumns.includes(key)).slice(0, 7);
  const hasActions = CARE_TABS_WITH_ACTIONS.includes(tab);

  return (
    <div className="care-table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((key) => (
              <th key={key} scope="col">{headerFor(key)}</th>
            ))}
            {hasActions && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.id ?? item.user_id ?? index)}>
              {Object.entries(item)
                .filter(([key]) => !hiddenColumns.includes(key))
                .slice(0, 7)
                .map(([key, value]) => (
                  <td key={key}>
                    {typeof value === 'object' && value !== null ? printable(value) : cellText(key, value)}
                  </td>
                ))}
              {hasActions && (
                <td>
                  <ButtonGroup size="compact">
                    {tab === 'visits' && (
                      <Button variant="outline" type="button" onClick={() => onReviewVisit(item)}>
                        Review visit
                      </Button>
                    )}
                    {tab === 'visits' && item.status === 'scheduled' && (
                      <>
                        <Button variant="outline" type="button" onClick={() => onReassignVisit(item)}>
                          Reassign
                        </Button>
                        <Button variant="outline" type="button" onClick={() => onCancelVisit(item)}>
                          Cancel visit
                        </Button>
                      </>
                    )}
                    {tab === 'flags' && (
                      <Button variant="outline" type="button" onClick={() => onSelectFlag(item)}>
                        Resolve
                      </Button>
                    )}
                    {tab === 'photos' && item.status !== 'hidden' && item.status !== 'expired' && (
                      <Button variant="outline" type="button" onClick={() => onHidePhoto(item)}>
                        Hide photo
                      </Button>
                    )}
                    {tab === 'alerts' && item.status === 'open' && (
                      <>
                        <Button variant="outline" type="button" onClick={() => onAcknowledgeAlert(item)}>
                          Acknowledge
                        </Button>
                        <Button variant="outline" type="button" onClick={() => onResolveAlert(item)}>
                          Resolve
                        </Button>
                      </>
                    )}
                    {tab === 'timesheets' && item.status === 'submitted' && (
                      <>
                        <Button variant="outline" type="button" onClick={() => onApproveTimesheet(item)}>
                          Approve
                        </Button>
                        <Button variant="outline" type="button" onClick={() => onSendBackTimesheet(item)}>
                          Send back
                        </Button>
                      </>
                    )}
                    {tab === 'sos' && item.status === 'sent' && (
                      <Button variant="outline" type="button" onClick={() => onAcknowledgeSos(item)}>
                        Acknowledge SOS
                      </Button>
                    )}
                  </ButtonGroup>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
