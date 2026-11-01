import { copy } from '../copy';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';

type LogoutGuardProps = {
  open: boolean;
  pendingItems: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutGuard({ open, pendingItems, onCancel, onConfirm }: LogoutGuardProps) {
  if (!open) return null;

  return <Sheet role="alertdialog" labelledBy="logout-guard-title" describedBy="logout-guard-description" className="logout-guard" backdropClassName="logout-guard-backdrop">
      <p className="eyebrow">{copy.profile.signOutHeading}</p>
      <h2 id="logout-guard-title">{copy.logout.heading}</h2>
      <p id="logout-guard-description">
        {pendingItems} {copy.logout.savedItem}{pendingItems === 1 ? '' : 's'} still need to sync or be reviewed. {copy.logout.keepDataHint}
      </p>
      <SheetActions className="logout-guard-actions">
        <PillButton type="button" tone="ghost" size="full" onClick={onCancel} showArrow={false}>{copy.logout.keepWorking}</PillButton>
        <PillButton type="button" tone="forest" size="full" onClick={onConfirm}>{copy.logout.confirm}</PillButton>
      </SheetActions>
  </Sheet>;
}
