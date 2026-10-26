import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import type { AdminUser, AdminUserPage, ScopeInfo, UserInvite, UserUpdate } from './types';
import styles from './UsersPage.module.css';
function listItems<T>(data: T[] | { items: T[] } | undefined): T[] {
  return Array.isArray(data) ? data : (data?.items ?? []);
}
export function UsersPage() {
  const { t } = useTranslation('admin');
  const { user: current } = useAuth();
  const client = useQueryClient();
  const canWrite = hasScopes(current, ['users:write']);
  const [openInvite, setOpenInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [invitePreset, setInvitePreset] = useState('nurse');
  const [inviteKind, setInviteKind] = useState<'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive'>('nurse');
  const [inviteReach, setInviteReach] = useState<'own' | 'team' | 'all'>('own');
  const [editingKind, setEditingKind] = useState<'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive'>('staff');
  const [editingReach, setEditingReach] = useState<'own' | 'team' | 'all'>('all');
  const [editingPreset, setEditingPreset] = useState('nurse');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () =>
      apiClient.get<AdminUserPage>('/admin/users', { params: { page: 1, page_size: 100 } }),
  });
  const scopes = useQuery({
    queryKey: ['admin', 'scopes'],
    queryFn: () => apiClient.get<ScopeInfo[]>('/admin/scopes'),
  });
  const presets = useQuery({
    queryKey: ['admin', 'scope-presets'],
    queryFn: () => apiClient.get<Record<string, string[]>>('/admin/scope-presets'),
  });
  const rows = useMemo(() => listItems(users.data), [users.data]);
  const scopeRows = listItems(scopes.data);
  const presetScopes = presets.data ?? {};
  const applyPreset = (preset: string) => {
    const next = presetScopes[preset] ?? [];
    return next.filter((scope) => current?.is_superadmin || (scope !== 'system:manage' && scope !== 'carecfg:write'));
  };
  const matchesInvitePreset = (chosenScopes: string[], preset: string) => {
    const expected = presetScopes[preset];
    if (!expected) return false;
    return [...chosenScopes].sort().join('|') === [...expected].sort().join('|');
  };
  const invite = useMutation({
    mutationFn: (body: UserInvite) => apiClient.post<AdminUser>('/admin/users', body),
    onSuccess: async () => {
      setOpenInvite(false);
      setName('');
      setEmail('');
      setChosen([]);
      setInviteKind('nurse'); setInviteReach('own'); setInvitePreset('nurse');
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserUpdate }) =>
      apiClient.patch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      setEditing(null);
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/admin/users/${encodeURIComponent(id)}/reset-password`, {}),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const signOut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/admin/users/${encodeURIComponent(id)}/sign-out`, {}),
  });
  const columns: DataColumn<AdminUser>[] = [
    { key: 'name', header: t('users.columns.name'), cell: (item) => item.name },
    { key: 'email', header: t('users.columns.email'), cell: (item) => item.email },
    {
      key: 'access',
      header: t('users.columns.access'),
      cell: (item) =>
        item.is_superadmin
          ? t('users.superadmin')
          : t('users.scopeCount', { count: item.scopes.length }),
    },
    {
      key: 'lastLogin',
      header: t('users.columns.lastLogin'),
      cell: (item) =>
        item.last_login
          ? new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'medium',
              timeZone: 'Africa/Kampala',
            }).format(new Date(item.last_login))
          : t('common.notProvided'),
    },
    {
      key: 'status',
      header: t('users.columns.status'),
      cell: (item) => (
        <Badge tone={item.status === 'active' ? 'default' : 'new'}>
          {t(`users.statuses.${item.status}`)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('users.columns.actions'),
      cell: (item) => (
        <div className={styles.actions}>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(item);
              setEditingScopes(item.scopes);
              setEditingKind((item.kind || 'staff') as typeof editingKind);
              setEditingReach(item.reach || 'all');
              setEditingPreset('nurse');
            }}
          >
            {t('users.editScopes')}
          </Button>
          <Button
            variant="outline"
            disabled={!canWrite || reset.isPending}
            onClick={() => reset.mutate(item.id)}
          >
            {t('users.resetPassword')}
          </Button>
          <Button
            variant="outline"
            disabled={!canWrite || signOut.isPending}
            onClick={() => signOut.mutate(item.id)}
          >
            {t('users.forceSignOut')}
          </Button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={t('nav.users')}
        subtitle={t('users.subtitle')}
        actions={
          canWrite ? (
            <Button
              disabled={!presets.data}
              onClick={() =>
                setOpenInvite((value) => {
                  const next = !value;
                  if (next) setChosen(applyPreset(invitePreset));
                  return next;
                })
              }
            >
              {t('users.invite')}
            </Button>
          ) : undefined
        }
      />
      {users.isError || scopes.isError || presets.isError ? (
        <div role="alert">
          <p>{t('users.error')}</p>
          <Button
            variant="outline"
            onClick={() => {
              void users.refetch();
              void scopes.refetch();
              void presets.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : !users.data || !scopes.data || !presets.data ? (
        <p aria-busy="true">{t('users.loading')}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(item) => item.id}
          labels={{
            caption: t('users.table.caption'),
            loading: t('users.table.loading'),
            empty: t('users.table.empty'),
          }}
        />
      )}
      {openInvite && canWrite && (
        <section className={styles.editor}>
          <h2>{t('users.inviteHeading')}</h2>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              const presetMatches = matchesInvitePreset(chosen, invitePreset);
              invite.mutate({ name: name.trim(), email: email.trim(), scopes: presetMatches ? [] : chosen, ...(presetMatches ? { preset: invitePreset as NonNullable<UserInvite['preset']> } : {}), kind: inviteKind, reach: inviteReach });
            }}
          >
            <Field
              label={t('users.name')}
              required
              requiredLabel={t('common.required')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
            <Field
              label={t('users.email')}
              type="email"
              required
              requiredLabel={t('common.required')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label className={styles.scope}>Account type
              <select value={inviteKind} onChange={(event) => setInviteKind(event.target.value as typeof inviteKind)}>
                <option value="staff">Staff</option><option value="nurse">Nurse</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option><option value="executive">Executive</option>
              </select>
            </label>
            <label className={styles.scope}>Data reach
              <select value={inviteReach} onChange={(event) => setInviteReach(event.target.value as typeof inviteReach)}>
                <option value="own">Own</option><option value="team">Team</option><option value="all">All</option>
              </select>
            </label>
            <div className={styles.actions}>
              <label>Access preset <select value={invitePreset} onChange={(event) => setInvitePreset(event.target.value)}><option value="nurse">Nurse</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option><option value="executive">Executive</option>{current?.is_superadmin && <option value="super_admin">Super admin</option>}</select></label>
              <Button type="button" variant="outline" onClick={() => { setChosen(applyPreset(invitePreset)); if (invitePreset !== 'staff') { setInviteKind(invitePreset === 'super_admin' ? 'admin' : invitePreset as typeof inviteKind); setInviteReach(invitePreset === 'nurse' ? 'own' : invitePreset === 'supervisor' ? 'team' : 'all'); } }}>Apply preset</Button>
            </div>
            <fieldset className={styles.scopeFieldset}>
              <legend>{t('users.grantScopes')}</legend>
              {Object.entries(
                scopeRows.reduce<Record<string, ScopeInfo[]>>((groups, scope) => {
                  (groups[scope.group] ??= []).push(scope);
                  return groups;
                }, {}),
              ).map(([group, items]) => (
                <div key={group} className={styles.scopeGroup}>
                  <h3>{group}</h3>
                  {items.map((scope) => (
                    <label key={scope.id} className={styles.scope}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(scope.id)}
                        disabled={(scope.id === 'system:manage' || scope.id === 'carecfg:write') && !current?.is_superadmin}
                        onChange={(event) =>
                          setChosen((old) =>
                            event.target.checked
                              ? [...old, scope.id]
                              : old.filter((id) => id !== scope.id),
                          )
                        }
                      />
                      <span>{scope.label || scope.id}</span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
            {invite.isError && <p role="alert">{t('users.inviteError')}</p>}
            <div className={styles.actions}>
              <Button type="submit" disabled={invite.isPending || !name.trim() || !email.trim()}>
                {t('users.sendInvite')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpenInvite(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </section>
      )}
      {editing && (
        <section className={styles.editor}>
          <h2>{t('users.editHeading', { name: editing.name })}</h2>
          {editing.id === current?.id && <p>{t('users.selfEditNotice')}</p>}
          <label className={styles.scope}>Account type
            <select value={editingKind} disabled={!canWrite || editing.id === current?.id} onChange={(event) => setEditingKind(event.target.value as typeof editingKind)}><option value="staff">Staff</option><option value="nurse">Nurse</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option><option value="executive">Executive</option></select>
          </label>
          <label className={styles.scope}>Data reach
            <select value={editingReach} disabled={!canWrite || editing.id === current?.id} onChange={(event) => setEditingReach(event.target.value as typeof editingReach)}><option value="own">Own</option><option value="team">Team</option><option value="all">All</option></select>
          </label>
          <div className={styles.actions}><label>Access preset <select value={editingPreset} onChange={(event) => setEditingPreset(event.target.value)}><option value="nurse">Nurse</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option><option value="executive">Executive</option>{current?.is_superadmin && <option value="super_admin">Super admin</option>}</select></label><Button type="button" variant="outline" disabled={!canWrite || editing.id === current?.id} onClick={() => setEditingScopes(applyPreset(editingPreset))}>Apply preset</Button></div>
          <fieldset className={styles.scopeFieldset}>
            <legend>{t('users.grantScopes')}</legend>
            {Object.entries(
              scopeRows.reduce<Record<string, ScopeInfo[]>>((groups, scope) => {
                (groups[scope.group] ??= []).push(scope);
                return groups;
              }, {}),
            ).map(([group, items]) => (
              <div key={group} className={styles.scopeGroup}>
                <h3>{group}</h3>
                {items.map((scope) => (
                  <label key={scope.id} className={styles.scope}>
                    <input
                      type="checkbox"
                      checked={editingScopes.includes(scope.id)}
                      disabled={
                        !canWrite ||
                        editing.id === current?.id ||
                        ((scope.id === 'system:manage' || scope.id === 'carecfg:write') && !current?.is_superadmin)
                      }
                      onChange={(event) =>
                        setEditingScopes((old) =>
                          event.target.checked
                            ? [...old, scope.id]
                            : old.filter((id) => id !== scope.id),
                        )
                      }
                    />
                    <span>{scope.label || scope.id}</span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          {update.isError && <p role="alert">{t('users.updateError')}</p>}
          <div className={styles.actions}>
            <Button
              disabled={!canWrite || editing.id === current?.id || update.isPending}
              onClick={() => update.mutate({ id: editing.id, body: { scopes: editingScopes, kind: editingKind, reach: editingReach } })}
            >
              {t('users.saveScopes')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setEditingScopes([]);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="outline"
              onClick={() => update.mutate({ id: editing.id, body: { active: !editing.active } })}
              disabled={!canWrite || editing.id === current?.id}
            >
              {editing.active ? t('users.deactivate') : t('users.activate')}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
