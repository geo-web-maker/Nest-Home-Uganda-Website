import type { Dispatch, SetStateAction } from 'react';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { FilterBar } from '../../../components/admin/FilterBar';
import type { AdminUser, ScopeInfo, UserUpdate } from './types';
import type { Translate } from './userManagementShared';
import styles from './UsersPage.module.css';

export function UserAccessEditorPanel({
  editing,
  currentUserId,
  isSuperAdmin,
  canWrite,
  editingKind,
  setEditingKind,
  editingReach,
  setEditingReach,
  editingPreset,
  setEditingPreset,
  editingScopes,
  setEditingScopes,
  scopeRows,
  updatePending,
  updateError,
  t,
  applyPreset,
  onUpdate,
  onCancel,
}: {
  editing: AdminUser;
  currentUserId?: string;
  isSuperAdmin: boolean;
  canWrite: boolean;
  editingKind: UserUpdate['kind'];
  setEditingKind: Dispatch<SetStateAction<NonNullable<UserUpdate['kind']>>>;
  editingReach: NonNullable<UserUpdate['reach']>;
  setEditingReach: Dispatch<SetStateAction<NonNullable<UserUpdate['reach']>>>;
  editingPreset: string;
  setEditingPreset: Dispatch<SetStateAction<string>>;
  editingScopes: string[];
  setEditingScopes: Dispatch<SetStateAction<string[]>>;
  scopeRows: ScopeInfo[];
  updatePending: boolean;
  updateError: boolean;
  t: Translate;
  applyPreset: (preset: string) => string[];
  onUpdate: (body: UserUpdate) => void;
  onCancel: () => void;
}) {
  const selfEdit = editing.id === currentUserId;

  return (
    <section className={styles.editor}>
      <h2>{t('users.editHeading', { name: editing.name })}</h2>
      {selfEdit && <p>{t('users.selfEditNotice')}</p>}
      <Field
        kind="select"
        label="Account type"
        value={editingKind ?? 'staff'}
        disabled={!canWrite || selfEdit}
        onChange={(event) => setEditingKind(event.target.value as NonNullable<UserUpdate['kind']>)}
      >
        <option value="staff">Staff</option>
        <option value="nurse">Nurse</option>
        <option value="supervisor">Supervisor</option>
        <option value="admin">Admin</option>
        <option value="executive">Executive</option>
        <option value="lawyer">Lawyer</option>
      </Field>
      <Field
        kind="select"
        label="Data reach"
        value={editingReach}
        disabled={!canWrite || selfEdit}
        onChange={(event) => setEditingReach(event.target.value as NonNullable<UserUpdate['reach']>)}
      >
        <option value="own">Own</option>
        <option value="team">Team</option>
        <option value="all">All</option>
      </Field>
      <FilterBar
        label="Access preset"
        className={styles.fullRow}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={!canWrite || selfEdit}
            onClick={() => setEditingScopes(applyPreset(editingPreset))}
          >
            Apply preset
          </Button>
        }
      >
        <Field
          kind="select"
          label="Access preset"
          value={editingPreset}
          onChange={(event) => setEditingPreset(event.target.value)}
        >
          <option value="nurse">Nurse</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
          <option value="executive">Executive</option>
          <option value="lawyer">Lawyer</option>
          {isSuperAdmin && <option value="super_admin">Super admin</option>}
        </Field>
      </FilterBar>
      <fieldset className={styles.scopeFieldset}>
        <legend>{t('users.grantScopes')}</legend>
        {Object.entries(
          scopeRows.reduce<Record<string, ScopeInfo[]>>((groups, scope) => {
            (groups[scope.group] ??= []).push(scope);
            return groups;
          }, {}),
        ).map(([group, groupScopes]) => (
          <div key={group} className={styles.scopeGroup}>
            <h3>{group}</h3>
            {groupScopes.map((scope) => (
              <Checkbox
                key={scope.id}
                label={scope.label || scope.id}
                checked={editingScopes.includes(scope.id)}
                disabled={
                  !canWrite ||
                  selfEdit ||
                  ((scope.id === 'system:manage' || scope.id === 'carecfg:write') && !isSuperAdmin)
                }
                onChange={(event) =>
                  setEditingScopes((old) =>
                    event.target.checked
                      ? [...old, scope.id]
                      : old.filter((id) => id !== scope.id),
                  )
                }
              />
            ))}
          </div>
        ))}
      </fieldset>
      {updateError && <p role="alert">{t('users.updateError')}</p>}
      <ButtonGroup className={styles.fullRow}>
        <Button
          disabled={!canWrite || selfEdit || updatePending}
          onClick={() =>
            onUpdate({ scopes: editingScopes, kind: editingKind, reach: editingReach })
          }
        >
          {t('users.saveScopes')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onUpdate({ active: !editing.active })}
          disabled={!canWrite || selfEdit}
        >
          {editing.active ? t('users.deactivate') : t('users.activate')}
        </Button>
      </ButtonGroup>
    </section>
  );
}
