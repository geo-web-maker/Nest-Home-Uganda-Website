import { copy } from '../copy';
import { PillButton } from '../ui/PillButton';

type LogoutGuardProps = {
  open: boolean;
  pendingItems: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutGuard({ open, pendingItems, onCancel, onConfirm }: LogoutGuardProps) {
  if (!open) return null;

  return <div className="sheet-backdrop logout-guard-backdrop">
    <section className="sheet logout-guard" role="alertdialog" aria-modal="true" aria-labelledby="logout-guard-title" aria-describedby="logout-guard-description">
      <div className="sheet-handle" aria-hidden="true" />
      <p className="eyebrow">{copy.profile.signOutHeading}</p>
      <h2 id="logout-guard-title">{copy.logout.heading}</h2>
      <p id="logout-guard-description">
        {pendingItems} {copy.logout.savedItem}{pendingItems === 1 ? '' : 's'} still need to sync or be reviewed. {copy.logout.keepDataHint}
      </p>
      <div className="sheet-actions logout-guard-actions">
        <PillButton type="button" tone="ghost" size="full" onClick={onCancel} showArrow={false}>{copy.logout.keepWorking}</PillButton>
        <PillButton type="button" tone="forest" size="full" onClick={onConfirm}>{copy.logout.confirm}</PillButton>
      </div>
    </section>
  </div>;
}
