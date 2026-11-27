import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { apiClient } from '@shared/lib/api/client';
import { useAuth } from './auth/useAuth';
import styles from './GovernancePages.module.css';

type AutoSsoUser = { id: string; name: string; email: string; active: boolean; is_superadmin: boolean; auto_sso_enabled: boolean; auto_sso_allowed: boolean; effective_enabled: boolean };
type Listing = { master_enabled: boolean; items: AutoSsoUser[]; total: number; page: number; page_size: number };

/** Superadmin-only controls. All writes are protected by the backend's verified TOTP-session dependency. */
export function CrossAppAuthPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const key = ['admin', 'cross-app-auto-sso', query, page];
  const settings = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<Listing>('/admin/security/auto-sso', { params: { q: query || undefined, page, page_size: 50 } }),
    enabled: Boolean(user?.is_superadmin),
    retry: false,
  });
  const master = useMutation({
    mutationFn: (enabled: boolean) => apiClient.patch<{ master_enabled: boolean }>('/admin/security/auto-sso/master', { enabled }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'cross-app-auto-sso'] }),
  });
  const perUser = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiClient.patch(`/admin/security/auto-sso/users/${encodeURIComponent(id)}`, { enabled }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'cross-app-auto-sso'] }),
  });

  if (!user?.is_superadmin) return <section className={styles.page}><SectionHeader title="Cross-app authentication" note="This control area is restricted to Superadmins." /><Notice tone="error"><p>Superadmin access is required.</p></Notice></section>;
  const data = settings.data;
  const pending = master.isPending || perUser.isPending;
  const failure = settings.error || master.error || perUser.error;

  return <section className={styles.page}>
    <SectionHeader title="Cross-app authentication" note="Control automatic sign-in between the Nest admin and nurse applications." />
    <Notice tone="warning"><strong>Automatic SSO is disabled by default.</strong><p>Keep the master switch off to prevent automatic cross-app sign-in for everyone. Manual, user-initiated app switching remains available. Enabling the master switch alone does not opt every user in.</p></Notice>
    {failure ? <Notice tone="error"><p>{failure instanceof Error ? failure.message : 'The cross-app authentication settings could not be loaded or saved.'}</p><Button variant="outline" size="compact" onClick={() => void settings.refetch()}>Retry</Button></Notice> : null}
    {data ? <>
      <article className={styles.card}>
        <h2>Master automatic SSO switch</h2>
        <p>When OFF, no user's preference can enable automatic SSO. When ON, Superadmin must also allow the individual account and that user must opt in.</p>
        <div className={styles.masterRow}>
          <strong>Master switch: {data.master_enabled ? 'ON' : 'OFF'}</strong>
          <Button disabled={pending} variant={data.master_enabled ? 'outline' : 'primary'} onClick={() => master.mutate(!data.master_enabled)}>
            {master.isPending ? 'Saving…' : data.master_enabled ? 'Turn master switch off' : 'Turn master switch on'}
          </Button>
        </div>
      </article>
      <article className={styles.card}>
        <h2>Per-user permissions</h2>
        <p>This controls whether Superadmin permits automatic SSO for each account. The user must separately opt in on their profile; the master switch must also be ON.</p>
        <Field label="Find a user" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name or email" />
        <p>{data.total} account(s) · Page {data.page}</p>
        {data.items.length === 0 ? <p>No users match this search.</p> : <div className={styles.userList}>
          {data.items.map((person) => <div key={person.id} className={styles.userRow}>
            <div><strong>{person.name}</strong><small>{person.email}{person.is_superadmin ? ' · Superadmin' : ''}{!person.active ? ' · Inactive' : ''}</small><small>User preference: {person.auto_sso_enabled ? 'ON' : 'OFF'} · Effective: {person.effective_enabled ? 'ON' : 'OFF'}</small></div>
            <Checkbox label="Superadmin allows automatic SSO" checked={person.auto_sso_allowed} disabled={pending || !person.active} onChange={(event) => perUser.mutate({ id: person.id, enabled: event.target.checked })} />
          </div>)}
        </div>}
        <div className={styles.actions}>
          <Button variant="outline" disabled={page <= 1 || settings.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <Button variant="outline" disabled={page * data.page_size >= data.total || settings.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      </article>
    </> : settings.isPending ? <p>Loading cross-app settings…</p> : null}
  </section>;
}
