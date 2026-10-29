import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Checkbox } from '../../components/ui/Checkbox';
import { PageHeader } from '../../components/admin/PageHeader';
import { apiClient } from '../../lib/api/client';
import { useAuth } from './auth/useAuth';
import styles from './GovernancePages.module.css';
import { FilterBar, filterBarGrow } from '../../components/admin/FilterBar';

type Release = {
  id: string;
  platform: 'android' | 'ios' | 'web';
  version: string;
  min_supported_version: string;
  download_path: string | null;
  release_notes: string;
  active: boolean;
  published_at: string;
};
type ReleaseResponse = { items: Release[] };
type CareSetting = { id: string; type: string; value: unknown; default: unknown; source: string; required_before_go_live: boolean; overridable_at: string[]; group: string };
type UserRow = { id: string; name: string; email: string; scopes: string[]; is_superadmin: boolean; status?: string };
type ScopeRow = { id: string; group: string; label: string };

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export function AppReleasesPage() {
  const { user } = useAuth();
  const allowed = Boolean(user?.is_superadmin);
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<'android' | 'ios' | 'web'>('android');
  const [version, setVersion] = useState('');
  const [minimum, setMinimum] = useState('');
  const [downloadPath, setDownloadPath] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState('');
  const releases = useQuery({
    queryKey: ['admin', 'app-releases'],
    queryFn: () => apiClient.get<ReleaseResponse>('/admin/app-releases'),
    enabled: allowed,
    retry: false,
  });
  const publish = useMutation({
    mutationFn: () => apiClient.post<Release>('/admin/app-releases', {
      id: `${platform}-${version.trim()}`,
      platform, version: version.trim(), min_supported_version: minimum.trim(),
      download_path: downloadPath.trim() || null, release_notes: notes.trim(), active,
    }),
    onSuccess: async () => {
      setFormError(''); setVersion(''); setMinimum(''); setDownloadPath(''); setNotes(''); setActive(true);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Release could not be published.'),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version.trim()) || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(minimum.trim())) {
      setFormError('Enter valid semantic versions, for example 1.2.3.'); return;
    }
    if (downloadPath && !(downloadPath.startsWith('/') && !downloadPath.startsWith('//')) && !downloadPath.startsWith('https://')) {
      setFormError('Download path must be a same-origin path or HTTPS URL.'); return;
    }
    publish.mutate();
  };
  return (
    <section className={styles.page}>
      <PageHeader title="App releases" subtitle="Publish server-owned version policies. Publishing may trigger soft or blocking updates for clients." />
      {!allowed ? <p role="alert">Super administrator access is required to view or publish app releases.</p> : null}
      {allowed && releases.isPending ? <p role="status">Loading release records…</p> : null}
      {allowed && releases.isError ? <div role="alert"><p>Release records could not be loaded. Check your access and API connection.</p><Button variant="outline" onClick={() => void releases.refetch()}>Retry</Button></div> : null}
      {allowed ? <form className={styles.card} onSubmit={submit}>
        <h2>Publish a release</h2>
        <p>Publishing changes the version policy consumed by field apps. Confirm the minimum version before publishing.</p>
        <div className={styles.formGrid}>
          <Field kind="select" label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}><option value="android">Android</option><option value="ios">iOS</option><option value="web">Web</option></Field>
          <Field label="Version" value={version} onChange={(e: ChangeEvent<HTMLInputElement>) => setVersion(e.target.value)} placeholder="1.2.3" required requiredLabel="(required)" />
          <Field label="Minimum supported version" value={minimum} onChange={(e: ChangeEvent<HTMLInputElement>) => setMinimum(e.target.value)} placeholder="1.0.0" required requiredLabel="(required)" />
          <Field label="Download path (optional)" value={downloadPath} onChange={(e: ChangeEvent<HTMLInputElement>) => setDownloadPath(e.target.value)} placeholder="/downloads/app.apk or https://…" />
        </div>
        <Field kind="textarea" label="Release notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
        <Checkbox label="Activate this release policy" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {formError ? <p role="alert">{formError}</p> : null}
        {publish.isError ? <p role="alert">{formError || 'Release was not published.'}</p> : null}
        {publish.isSuccess ? <p role="status">Release published successfully.</p> : null}
        <Button type="submit" disabled={publish.isPending}>{publish.isPending ? 'Publishing…' : 'Publish release'}</Button>
      </form> : null}
      {allowed && releases.data && releases.data.items.length === 0 ? <p>No releases have been published yet.</p> : null}
      {allowed && releases.data && releases.data.items.length > 0 ? <div className={styles.tableWrap}><table className={styles.table}><caption>Published app release policies</caption><thead><tr><th>Platform</th><th>Version</th><th>Minimum supported</th><th>Policy</th><th>Published</th><th>Notes</th></tr></thead><tbody>{releases.data.items.map((release) => <tr key={release.id}><td>{release.platform}</td><td>{release.version}</td><td>{release.min_supported_version}</td><td>{release.active ? 'Active' : 'Inactive'}</td><td>{dateLabel(release.published_at)}</td><td>{release.release_notes || '—'}</td></tr>)}</tbody></table></div> : null}
      <div className={styles.card}><h2>Adoption analytics</h2><p>Not connected yet. The current API records published policies but does not report installed versions, active devices, rollout percentage, or adoption over time. Do not infer adoption from release records.</p></div>
    </section>
  );
}

export function BackupsHealthPage() {
  return (
    <section className={styles.page}>
      <PageHeader title="Backups and hosting health" subtitle="Operational evidence only; no live backup provider is connected to this screen yet." />
      <div className={styles.card}>
        <h2>Backup provider</h2><p><strong>Not connected yet</strong></p>
        <p>This application cannot currently verify the latest backup, backup age, retention, or provider-side success.</p>
      </div>
      <div className={styles.card}>
        <h2>Restore proof</h2><p><strong>Not recorded</strong></p>
        <p>Record a dated restore drill and evidence in the recovery runbook after verifying it in the hosting provider.</p>
      </div>
      <div className={styles.card}>
        <h2>Before go-live</h2>
        <ul><li>Confirm backup ownership and alert recipients.</li><li>Verify retention and access controls.</li><li>Perform a restore test and record evidence.</li><li>Confirm hosting health monitoring and escalation.</li></ul>
      </div>
    </section>
  );
}

export function PermissionsPage() {
  const { user: current } = useAuth();
  const users = useQuery({ queryKey: ['admin', 'permissions', 'users'], queryFn: () => apiClient.get<{ items: UserRow[] } | UserRow[]>('/admin/users', { params: { page: 1, page_size: 100 } }), retry: false });
  const scopes = useQuery({ queryKey: ['admin', 'permissions', 'scopes'], queryFn: () => apiClient.get<ScopeRow[]>('/admin/scopes'), retry: false });
  const [query, setQuery] = useState('');
  const userRows = Array.isArray(users.data) ? users.data : (users.data?.items ?? []);
  const scopeRows = scopes.data ?? [];
  const visibleUsers = userRows.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query.toLowerCase()));
  const scopeGroups = new Map<string, ScopeRow[]>();
  for (const scope of scopeRows) {
    const key = (scope.group || 'other').replaceAll('_', ' ');
    scopeGroups.set(key, [...(scopeGroups.get(key) ?? []), scope]);
  }
  return <section className={styles.page}>
    <PageHeader title="Permissions" subtitle="Read-only resource-by-person view. Change assignments in Users and scopes; server scope checks remain authoritative." />
    {!current ? <p role="status">Loading current access…</p> : null}
    {(users.isError || scopes.isError) ? <div role="alert"><p>The permission matrix could not be fully loaded. Your account may lack users:read or the API may be unavailable.</p><Button variant="outline" onClick={() => { void users.refetch(); void scopes.refetch(); }}>Retry</Button></div> : null}
    {users.isPending || scopes.isPending ? <p role="status">Loading users and resource scopes…</p> : null}
    {!users.isPending && !scopes.isPending && !users.isError && !scopes.isError ? <>
      <div className={styles.card}><p><strong>{userRows.length}</strong> users · <strong>{scopeRows.length}</strong> available scopes</p><Field label="Find a person" value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} placeholder="Name or email" /><p>Superadmins are marked explicitly; the check matrix shows direct scopes only. It does not simulate all server-side reach or policy logic.</p></div>
      {visibleUsers.length === 0 ? <p role="status">No people match “{query}”.</p> : <div className={styles.matrixWrap} role="region" aria-label="Permission matrix (scrolls sideways when there are many people)" tabIndex={0}>
        <table className={styles.matrix}>
          <caption>Direct user scopes (read-only)</caption>
          <thead><tr>
            <th scope="col" className={styles.matrixCorner}>Scope</th>
            {visibleUsers.map((person) => <th scope="col" key={person.id} className={styles.matrixPerson}>
              <span className={styles.matrixName}>{person.name}</span>
              <small>{person.email}</small>
              <span className={styles.matrixTags}>{person.is_superadmin ? <strong>Superadmin</strong> : null}<em>{person.status || '—'}</em></span>
            </th>)}
          </tr></thead>
          <tbody>{[...scopeGroups.entries()].map(([group, list]) => <Fragment key={group}>
            <tr><th scope="colgroup" colSpan={visibleUsers.length + 1} className={styles.matrixGroup}>{group}</th></tr>
            {list.map((scope) => <tr key={scope.id}>
              <th scope="row" className={styles.matrixScope}>{scope.label || scope.id}<small>{scope.id}</small></th>
              {visibleUsers.map((person) => {
                const granted = person.is_superadmin || person.scopes.includes(scope.id);
                return <td key={person.id} className={granted ? styles.matrixYes : styles.matrixNo} aria-label={`${person.name}: ${scope.id}: ${granted ? 'granted' : 'not granted'}`}>{granted ? '✓' : '—'}</td>;
              })}
            </tr>)}
          </Fragment>)}</tbody>
        </table>
      </div>}
      <p><a href="/admin/users">Manage user assignments in Users and scopes</a>. This matrix is intentionally read-only and never grants permissions.</p>
    </> : null}
  </section>;
}

export function CareSettingCataloguePage() {
  const settings = useQuery({ queryKey: ['admin', 'care-setting-catalogue'], queryFn: () => apiClient.get<{ items: CareSetting[] }>('/admin/care/settings'), retry: false });
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const rows = settings.data?.items ?? [];
  const groups = [...new Set(rows.map((row) => row.group))].sort();
  const filtered = rows.filter((row) => (group === 'all' || row.group === group) && `${row.id} ${row.group} ${row.type}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.page}><PageHeader title="Care setting catalogue" subtitle="Schema-backed catalogue from the care settings API. Values are read-only here; edit them in Care settings." />
    {settings.isPending ? <p role="status">Loading setting catalogue…</p> : null}
    {settings.isError ? <div role="alert"><p>Catalogue unavailable. Confirm carecfg:read access and API connectivity.</p><Button variant="outline" onClick={() => void settings.refetch()}>Retry</Button></div> : null}
    {settings.data ? <><FilterBar label="Filter settings" meta={`${rows.length} registered settings`}><Field label="Search settings" type="search" className={filterBarGrow} value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} placeholder="Key, group or type" /><Field kind="select" label="Group" value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">All groups</option>{groups.map((item) => <option key={item}>{item}</option>)}</Field></FilterBar>
    <div className={styles.tableWrap}><table className={styles.table}><caption>Care settings schema and current values</caption><thead><tr><th>Setting</th><th>Group</th><th>Type</th><th>Current value</th><th>Source</th><th>Default</th><th>Override levels</th><th>Go-live</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><th scope="row">{row.id}</th><td>{row.group}</td><td>{row.type}</td><td><code>{JSON.stringify(row.value)}</code></td><td>{row.source}</td><td><code>{JSON.stringify(row.default)}</code></td><td>{row.overridable_at.join(', ') || 'None'}</td><td>{row.required_before_go_live ? 'Required' : '—'}</td></tr>)}</tbody></table></div></> : null}
  </section>;
}

export function DataRetentionPage() {
  const settings = useQuery({ queryKey: ['admin', 'retention-settings'], queryFn: () => apiClient.get<{ items: CareSetting[] }>('/admin/care/settings'), retry: false });
  const readiness = useQuery({ queryKey: ['admin', 'retention-readiness'], queryFn: () => apiClient.get<{ items: { id: string; label: string; status: string; detail?: string }[] }>('/admin/care/readiness'), retry: false });
  const keys = ['retention.coordinates_months', 'retention.photos_months', 'retention.sos_months', 'retention.requests_months'];
  const rows = (settings.data?.items ?? []).filter((item) => keys.includes(item.id));
  return <section className={styles.page}><PageHeader title="Data and retention" subtitle="Current retention settings, go-live evidence, and data-subject request entry point." />
    {(settings.isPending || readiness.isPending) ? <p role="status">Loading retention and readiness evidence…</p> : null}
    {(settings.isError || readiness.isError) ? <div role="alert"><p>Some retention evidence could not be loaded. No retention job or deletion success is inferred from settings alone.</p><Button variant="outline" onClick={() => { void settings.refetch(); void readiness.refetch(); }}>Retry</Button></div> : null}
    {settings.data ? <div className={styles.tableWrap}><table className={styles.table}><caption>Configured retention periods (months)</caption><thead><tr><th>Data class</th><th>Configured months</th><th>Source</th><th>Required before go-live</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.id.replace('retention.', '').replaceAll('_', ' ')}</th><td>{String(row.value)}</td><td>{row.source}</td><td>{row.required_before_go_live ? 'Yes' : 'No'}</td></tr>)}</tbody></table><p>These values show configured policy only. They do not prove a scheduled retention job ran or deleted records.</p></div> : null}
    {readiness.data ? <div className={styles.card}><h2>Go-live evidence</h2><ul>{readiness.data.items.filter((item) => item.id.startsWith('retention.') || item.id.includes('restore') || item.id.includes('database')).map((item) => <li key={item.id}><strong>{item.label}</strong>: {item.status}{item.detail ? ` — ${item.detail}` : ''}</li>)}</ul></div> : null}
    <div className={styles.card}><h2>Data subject requests and consent</h2><p>Review and process requests in the existing data requests screen. Consent and privacy notices are configured in Care settings. This page does not create consent records or claim requests are fulfilled.</p><p><a href="/admin/care/data-requests">Open data requests</a> · <a href="/admin/care/settings">Open care settings</a></p></div>
  </section>;
}
