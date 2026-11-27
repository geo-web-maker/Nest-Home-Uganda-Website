import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dialogs } from '@shared/lib/dialogs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Translate } from './userManagementShared';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '@shared/components/ui/Badge';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import type {
  AdminUser,
  AdminUserIssued,
  AdminUserPage,
  Delivery,
  Issued,
  ScopeInfo,
  UserInvite,
  UserUpdate,
} from './types';

import { LoadingNote } from '../../../components/admin/LoadingNote';
import { IssuedCredentialsPanel } from './IssuedCredentialsPanel';
import { PasswordResetPanel } from './PasswordResetPanel';
import { UserAccessEditorPanel } from './UserAccessEditorPanel';
import { UserInvitePanel } from './UserInvitePanel';
/** The server's message plus the fields it rejected, e.g. "Please check the highlighted fields. (scopes: List should have at most 64 items)". */
function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const fields = (error as { fields?: Record<string, string> }).fields ?? {};
  const detail = Object.entries(fields).map(([name, why]) => `${name}: ${why}`).join('; ');
  return detail ? `${error.message} (${detail})` : error.message;
}
function listItems<T>(data: T[] | { items: T[] } | undefined): T[] {
  return Array.isArray(data) ? data : (data?.items ?? []);
}
export function UsersPage() {
  const { t } = useTranslation('admin');
  const tr: Translate = (...args) => String((t as unknown as (...a: unknown[]) => unknown)(...args));
  const { user: current } = useAuth();
  const client = useQueryClient();
  const canWrite = hasScopes(current, ['users:write']);
  const [openInvite, setOpenInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState<Delivery[]>(['email']);
  const [issued, setIssued] = useState<({ name: string } & Issued) | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [resetDelivery, setResetDelivery] = useState<Delivery[]>(['email']);
  const [copied, setCopied] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [invitePreset, setInvitePreset] = useState('nurse');
  const [inviteKind, setInviteKind] = useState<
    'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive' | 'lawyer'
  >('nurse');
  const [inviteReach, setInviteReach] = useState<'own' | 'team' | 'all'>('own');
  const [editingKind, setEditingKind] = useState<
    'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive' | 'lawyer'
  >('staff');
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
    return next.filter(
      (scope) => current?.is_superadmin || (scope !== 'system:manage' && scope !== 'carecfg:write'),
    );
  };
  const matchesInvitePreset = (chosenScopes: string[], preset: string) => {
    const expected = presetScopes[preset];
    if (!expected) return false;
    return [...chosenScopes].sort().join('|') === [...expected].sort().join('|');
  };
  const invite = useMutation({
    mutationFn: (body: UserInvite) => apiClient.post<AdminUserIssued>('/admin/users', body),
    onSuccess: async (created) => {
      setIssued({ name: created.name, temp_password: created.temp_password, delivered: created.delivered });
      setCopied(false);
      setOpenInvite(false);
      setName('');
      setEmail('');
      setPhone('');
      setDelivery(['email']);
      setChosen([]);
      setInviteKind('nurse');
      setInviteReach('own');
      setInvitePreset('nurse');
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
    mutationFn: ({ id, channels }: { id: string; channels: Delivery[] }) =>
      apiClient.post<Issued>(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
        delivery: channels,
      }),
    onSuccess: async (result) => {
      setIssued({ name: resetting?.name ?? '', ...result });
      setCopied(false);
      setResetting(null);
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/users/${encodeURIComponent(id)}`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => void dialogs.alert(e instanceof Error ? e.message : 'Delete failed'),
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
        <ButtonGroup size="compact">
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
            onClick={() => {
              setResetting(item);
              setResetDelivery(['email']);
              reset.reset();
            }}
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
          <Button
            variant="outline"
            disabled={!canWrite || remove.isPending || item.id === current?.id}
            onClick={async () => {
              if (await dialogs.confirm(t('users.confirmDelete', { name: item.name || item.email }), { confirmLabel: 'Delete', danger: true }))
                remove.mutate(item.id);
            }}
          >
            {t('users.delete')}
          </Button>
        </ButtonGroup>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title={t('nav.users')}
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
        <LoadingNote>{t('users.loading')}</LoadingNote>
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
      {issued && (
        <IssuedCredentialsPanel
          issued={issued}
          copied={copied}
          t={tr}
          onCopied={() => setCopied(true)}
          onDismiss={() => setIssued(null)}
        />
      )}
      {resetting && canWrite && (
        <PasswordResetPanel
          resetting={resetting}
          resetDelivery={resetDelivery}
          setResetDelivery={setResetDelivery}
          isPending={reset.isPending}
          errorText={
            reset.isError
              ? reset.error instanceof Error && reset.error.message
                ? reset.error.message
                : t('users.updateError')
              : null
          }
          t={tr}
          onSubmit={() => reset.mutate({ id: resetting.id, channels: resetDelivery })}
          onCancel={() => setResetting(null)}
        />
      )}
      {openInvite && canWrite && (
        <UserInvitePanel
          t={tr}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          delivery={delivery}
          setDelivery={setDelivery}
          chosen={chosen}
          setChosen={setChosen}
          inviteKind={inviteKind}
          setInviteKind={setInviteKind}
          inviteReach={inviteReach}
          setInviteReach={setInviteReach}
          invitePreset={invitePreset}
          setInvitePreset={setInvitePreset}
          scopeRows={scopeRows}
          isSuperAdmin={Boolean(current?.is_superadmin)}
          isPending={invite.isPending}
          errorText={invite.isError ? describeError(invite.error, t('users.inviteError')) : null}
          applyPreset={applyPreset}
          matchesInvitePreset={matchesInvitePreset}
          onSubmit={(body) => invite.mutate(body)}
          onCancel={() => setOpenInvite(false)}
        />
      )}
      {editing && (
        <UserAccessEditorPanel
          editing={editing}
          currentUserId={current?.id}
          isSuperAdmin={Boolean(current?.is_superadmin)}
          canWrite={canWrite}
          editingKind={editingKind}
          setEditingKind={setEditingKind}
          editingReach={editingReach}
          setEditingReach={setEditingReach}
          editingPreset={editingPreset}
          setEditingPreset={setEditingPreset}
          editingScopes={editingScopes}
          setEditingScopes={setEditingScopes}
          scopeRows={scopeRows}
          updatePending={update.isPending}
          updateError={update.isError}
          t={tr}
          applyPreset={applyPreset}
          onUpdate={(body) => update.mutate({ id: editing.id, body })}
          onCancel={() => {
            setEditing(null);
            setEditingScopes([]);
          }}
        />
      )}
    </>
  );
}
