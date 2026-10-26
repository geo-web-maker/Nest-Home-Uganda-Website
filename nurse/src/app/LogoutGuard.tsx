import { copy } from '../copy';

type LogoutGuardProps = {
  open: boolean;
  pendingItems: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutGuard({ open, pendingItems, onCancel, onConfirm }: LogoutGuardProps) {
  if (!open) return null;

  return (
    <section className="panel logout-guard" role="alertdialog" aria-modal="true" aria-labelledby="logout-guard-title" aria-describedby="logout-guard-description">
      <h2 id="logout-guard-title">{copy.logout.heading}</h2>
      <p id="logout-guard-description">
        {pendingItems} {copy.logout.savedItem}{pendingItems === 1 ? '' : 's'} still need to sync or be reviewed. {copy.logout.keepDataHint}
      </p>
      <div className="logout-guard-actions">
        <button type="button" onClick={onCancel}>{copy.logout.keepWorking}</button>
        <button type="button" onClick={onConfirm}>{copy.logout.confirm}</button>
      </div>
    </section>
  );
}
