import { Button } from '@shared/components/ui/Button';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import styles from './AgreementsPage.module.css';

const DELETABLE_STATUSES = new Set(['draft', 'changes_requested', 'expired', 'voided']);

type AgreementLifecycleActionsProps = {
  status: string;
  isTest?: boolean;
  canWrite: boolean;
  canVoid: boolean;
  busy: boolean;
  onDelete: () => void;
  onCreateAmendment: () => void;
  onOpenSealedPdf: () => void;
};

/** Destructive and post-completion actions are grouped in one dedicated presentation module. */
export function AgreementLifecycleActions({
  status,
  isTest,
  canWrite,
  canVoid,
  busy,
  onDelete,
  onCreateAmendment,
  onOpenSealedPdf,
}: AgreementLifecycleActionsProps) {
  const canDelete = canVoid && (DELETABLE_STATUSES.has(status) || isTest);
  const canAmend = canWrite && status === 'completed';
  const canDownload = canAmend;

  if (!canDelete && !canAmend) return null;

  return (
    <>
      {canDelete && (
        <>
          <ButtonGroup>
            <Button variant="danger-outline" onClick={onDelete} disabled={busy}>
              Delete agreement
            </Button>
          </ButtonGroup>
          <p className={styles.hint}>
            Deleting removes this agreement permanently. Sent or signed agreements must be voided
            first; completed agreements cannot be deleted.
          </p>
        </>
      )}
      {canAmend && (
        <ButtonGroup>
          <Button variant="outline" onClick={onCreateAmendment} disabled={busy}>
            Create amendment
          </Button>
          {canDownload && (
            <Button variant="outline" onClick={onOpenSealedPdf} disabled={busy}>
              Download internal sealed PDF
            </Button>
          )}
        </ButtonGroup>
      )}
    </>
  );
}
