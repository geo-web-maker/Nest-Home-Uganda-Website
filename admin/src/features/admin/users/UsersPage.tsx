import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dialogs } from '@shared/lib/dialogs';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { FilterBar } from '../../../components/admin/FilterBar';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Badge } from '@shared/components/ui/Badge';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { Checkbox } from '@shared/components/ui/Checkbox';
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

const DELIVERIES: Delivery[] = ['email', 'sms', 'temp_password'];
function toggle(list: Delivery[], item: Delivery, on: boolean): Delivery[] {
  return on ? [...list.filter((d) => d !== item), item] : list.filter((d) => d !== item);
}
import styles from './UsersPage.module.css';
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
              if (await dialogs.confirm(t('users.confirmDelete', { name: item.name || item.email }), { confirmLabel: 'Delete' }))
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
      {issued && (
        <section className={styles.editor} aria-live="polite">
          <h2>{t('users.issuedHeading', { name: issued.name })}</h2>
          {Object.entries(issued.delivered ?? {}).map(([channel, state]) => (
            <p key={channel} role={state === 'failed' ? 'alert' : undefined}>
              {t(`users.delivery.${channel}`)}: {t(`users.outcome.${state}`)}
            </p>
          ))}
          {issued.temp_password ? (
            <>
              <Field
                label={t('users.issuedTemp')}
                value={issued.temp_password}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <p>{t('users.issuedTempNote')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.temp_password ?? '').then(() => setCopied(true));
                }}
              >
                {copied ? t('users.copied') : t('users.copy')}
              </Button>
            </>
          ) : null}
          <ButtonGroup>
            <Button type="button" onClick={() => setIssued(null)}>
              {t('users.dismiss')}
            </Button>
          </ButtonGroup>
        </section>
      )}
      {resetting && canWrite && (
        <section className={styles.editor}>
          <h2>{t('users.resetHeading', { name: resetting.name })}</h2>
          <fieldset>
            <legend>{t('users.deliveryLegend')}</legend>
            {DELIVERIES.map((d) => (
              <Checkbox
                key={d}
                label={t(`users.delivery.${d}`)}
                checked={resetDelivery.includes(d)}
                onChange={(event) => setResetDelivery((old) => toggle(old, d, event.target.checked))}
              />
            ))}
          </fieldset>
          {reset.isError && <p role="alert">{reset.error instanceof Error && reset.error.message ? reset.error.message : t('users.updateError')}</p>}
          <ButtonGroup>
            <Button
              type="button"
              disabled={reset.isPending || resetDelivery.length === 0}
              onClick={() => reset.mutate({ id: resetting.id, channels: resetDelivery })}
            >
              {t('users.resetSend')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setResetting(null)}>
              {t('common.cancel')}
            </Button>
          </ButtonGroup>
        </section>
      )}
      {openInvite && canWrite && (
        <section className={styles.editor}>
          <h2>{t('users.inviteHeading')}</h2>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              const presetMatches = matchesInvitePreset(chosen, invitePreset);
              invite.mutate({
                name: name.trim(),
                email: email.trim(),
                scopes: presetMatches ? [] : chosen,
                ...(presetMatches
                  ? { preset: invitePreset as NonNullable<UserInvite['preset']> }
                  : {}),
                kind: inviteKind,
                reach: inviteReach,
                delivery,
                ...(phone.trim() ? { phone: phone.trim() } : {}),
              });
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
            <Field
              label={t('users.phone')}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={32}
              autoComplete="off"
            />
            <fieldset className={styles.fullRow}>
              <legend>{t('users.deliveryLegend')}</legend>
              {DELIVERIES.map((d) => (
                <Checkbox
                  key={d}
                  label={t(`users.delivery.${d}`)}
                  checked={delivery.includes(d)}
                  onChange={(event) => setDelivery((old) => toggle(old, d, event.target.checked))}
                />
              ))}
            </fieldset>
            <Field kind="select" label="Account type"
                value={inviteKind}
                onChange={(event) => setInviteKind(event.target.value as typeof inviteKind)}
              >
                <option value="staff">Staff</option>
                <option value="nurse">Nurse</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
                <option value="executive">Executive</option>
                <option value="lawyer">Lawyer</option>
              </Field>
            <Field kind="select" label="Data reach"
                value={inviteReach}
                onChange={(event) => setInviteReach(event.target.value as typeof inviteReach)}
              >
                <option value="own">Own</option>
                <option value="team">Team</option>
                <option value="all">All</option>
              </Field>
            <FilterBar label="Access preset" className={styles.fullRow} actions={<Button
                type="button"
                variant="outline"
                onClick={() => {
                  setChosen(applyPreset(invitePreset));
                  if (invitePreset !== 'staff') {
                    setInviteKind(
                      invitePreset === 'super_admin'
                        ? 'admin'
                        : (invitePreset as typeof inviteKind),
                    );
                    setInviteReach(
                      invitePreset === 'nurse'
                        ? 'own'
                        : invitePreset === 'supervisor'
                          ? 'team'
                          : 'all',
                    );
                  }
                }}
              >
                Apply preset
              </Button>}>
              <Field kind="select" label="Access preset"
                  value={invitePreset}
                  onChange={(event) => setInvitePreset(event.target.value)}
                >
                  <option value="nurse">Nurse</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                  <option value="executive">Executive</option>
                  <option value="lawyer">Lawyer</option>
                  {current?.is_superadmin && <option value="super_admin">Super admin</option>}
                </Field>
</FilterBar>
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
                    <Checkbox
                      key={scope.id}
                      label={scope.label || scope.id}
                      checked={chosen.includes(scope.id)}
                      disabled={
                        (scope.id === 'system:manage' || scope.id === 'carecfg:write') &&
                        !current?.is_superadmin
                      }
                      onChange={(event) =>
                        setChosen((old) =>
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
            {delivery.length === 0 && <p role="alert">{t('users.deliveryNone')}</p>}
            {invite.isError && <p role="alert" ref={(el) => el?.scrollIntoView({ block: 'center' })}>{describeError(invite.error, t('users.inviteError'))}</p>}
            <ButtonGroup className={styles.fullRow}>
              <Button type="submit" disabled={
                  invite.isPending ||
                  !name.trim() ||
                  !email.trim() ||
                  delivery.length === 0 ||
                  (delivery.includes('sms') && !phone.trim())
                }>
                {t('users.sendInvite')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpenInvite(false)}>
                {t('common.cancel')}
              </Button>
            </ButtonGroup>
          </form>
        </section>
      )}
      {editing && (
        <section className={styles.editor}>
          <h2>{t('users.editHeading', { name: editing.name })}</h2>
          {editing.id === current?.id && <p>{t('users.selfEditNotice')}</p>}
          <Field kind="select" label="Account type"
              value={editingKind}
              disabled={!canWrite || editing.id === current?.id}
              onChange={(event) => setEditingKind(event.target.value as typeof editingKind)}
            >
              <option value="staff">Staff</option>
              <option value="nurse">Nurse</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
              <option value="executive">Executive</option>
              <option value="lawyer">Lawyer</option>
            </Field>
          <Field kind="select" label="Data reach"
              value={editingReach}
              disabled={!canWrite || editing.id === current?.id}
              onChange={(event) => setEditingReach(event.target.value as typeof editingReach)}
            >
              <option value="own">Own</option>
              <option value="team">Team</option>
              <option value="all">All</option>
            </Field>
          <FilterBar label="Access preset" className={styles.fullRow} actions={<Button
              type="button"
              variant="outline"
              disabled={!canWrite || editing.id === current?.id}
              onClick={() => setEditingScopes(applyPreset(editingPreset))}
            >
              Apply preset
            </Button>}>
            <Field kind="select" label="Access preset"
                value={editingPreset}
                onChange={(event) => setEditingPreset(event.target.value)}
              >
                <option value="nurse">Nurse</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
                <option value="executive">Executive</option>
                <option value="lawyer">Lawyer</option>
                {current?.is_superadmin && <option value="super_admin">Super admin</option>}
              </Field>
</FilterBar>
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
                  <Checkbox
                    key={scope.id}
                    label={scope.label || scope.id}
                    checked={editingScopes.includes(scope.id)}
                    disabled={
                      !canWrite ||
                      editing.id === current?.id ||
                      ((scope.id === 'system:manage' || scope.id === 'carecfg:write') &&
                        !current?.is_superadmin)
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
          {update.isError && <p role="alert">{t('users.updateError')}</p>}
          <ButtonGroup className={styles.fullRow}>
            <Button
              disabled={!canWrite || editing.id === current?.id || update.isPending}
              onClick={() =>
                update.mutate({
                  id: editing.id,
                  body: { scopes: editingScopes, kind: editingKind, reach: editingReach },
                })
              }
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
          </ButtonGroup>
        </section>
      )}
    </>
  );
}
