/** A logout confirmation is required whenever local work still needs review or sync. */
export function needsLogoutConfirmation(pendingItems: number): boolean {
  return Number.isFinite(pendingItems) && pendingItems > 0;
}
