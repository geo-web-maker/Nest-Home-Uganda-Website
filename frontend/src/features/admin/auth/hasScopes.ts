import type { UserPublic } from '../../../types';

/** True when the user holds every scope in `needed`. A superadmin passes everything (spec 12.1). */
export function hasScopes(
  user: Pick<UserPublic, 'scopes' | 'is_superadmin'> | null,
  needed: readonly string[],
): boolean {
  if (!user) return false;
  if (user.is_superadmin) return true;
  return needed.every((scope) => user.scopes.includes(scope));
}
