import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@shared/components/ui/Button';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';
import { cx } from '@shared/lib/cx';
import { TestClientPanel, type TestClientStatus } from './TestClientPanel';
import styles from './Diagnostics.module.css';

type TestAccount = { key: string; name: string; email: string; kind: string; active: boolean; scopes: string[]; preset: string; reach: string };
type Config = { enabled: boolean; delivery: 'sink' | 'allowlist'; emails: string[]; phones: string[] };
type Listing = {
  config: Config; items: TestAccount[]; linked: boolean; reaches: string[];
  presets: Record<string, string[]>; scenarios: Record<string, string>;
  catalogue: { id: string; group: string; label: string }[];
  client?: TestClientStatus;
};
type Activated = { key: string; email: string; password: string };

/**
 * Superadmin only. A master switch sits on top: while it is off both accounts are off, cannot sign in, and
 * everything they made is deleted. Nothing can reach them by email, SMS or a reset link. Their own email and
 * SMS go nowhere by default; add your own address or number to the delivery list to really receive them.
 *
 * Superadmin only. A test nurse and a test admin, switched on with the authenticator. Who they are to
 * each other is scope based: pick a scenario, or set each account's preset, scopes and reach and the
 * supervisor link yourself, and switch whenever you like. Changes apply at the account's next sign-in.
 * Mail stays between the two, texts and push never reach real people, and their data is deleted on switch-off.
 * The list loads on click, so the code prompt appears first and an error only shows if it is cancelled.
 */
export function TestAccountsSection() {
  const client = useQueryClient();
  const [shown, setShown] = useState(false);
  const [emails, setEmails] = useState<string | null>(null);
  const [phones, setPhones] = useState<string | null>(null);
  const [issued, setIssued] = useState<Activated | null>(null);
  const [message, setMessage] = useState('');
  const [custom, setCustom] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const key = ['admin', 'test-accounts'];
  const accounts = useQuery({ queryKey: key, queryFn: () => apiClient.get<Listing>('/admin/test-accounts'), enabled: shown, retry: false });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const post = (path: string, body: unknown = {}) => apiClient.post<Record<string, unknown>>(`/admin/test-accounts${path}`, body);
  const put = (path: string, body: unknown) => apiClient.put<Record<string, unknown>>(`/admin/test-accounts${path}`, body);

  const toggle = useMutation({
    mutationFn: ({ k, active }: { k: string; active: boolean }) => post(`/${k}/${active ? 'deactivate' : 'activate'}`) as Promise<Activated>,
    onSuccess: (result, vars) => {
      setIssued(vars.active ? null : result);
      setMessage(vars.active ? 'Switched off. Test data is deleted once both accounts are off.' : '');
      void refresh();
    },
  });
  const change = useMutation({
    mutationFn: (args: { path: string; body: unknown; put?: boolean }) => (args.put ? put(args.path, args.body) : post(args.path, args.body)),
    onSuccess: () => { setMessage('Saved. The account picks this up when it next signs in.'); void refresh(); },
  });
  const reset = useMutation({
    mutationFn: () => post('/reset-data'),
    onSuccess: () => { setMessage('Test data deleted.'); void refresh(); },
  });
  const master = useMutation({
    mutationFn: (enabled: boolean) => post('/master', { enabled }),
    onSuccess: (_r, enabled) => { setIssued(null); setMessage(enabled ? 'Test accounts are available. Switch each one on below.' : 'Master switch off. Both accounts are off and their data is deleted.'); void refresh(); },
  });
  const failure = [toggle, change, reset, master].find((m) => m.isError)?.error;
  const data = accounts.data;
  const config = data?.config;
  const saveDelivery = (delivery: Config['delivery']) => change.mutate({
    path: '/config',
    body: { delivery, emails: (emails ?? config?.emails.join(' ') ?? '').split(/[\s,;]+/).filter(Boolean), phones: (phones ?? config?.phones.join(' ') ?? '').split(/[\s,;]+/).filter(Boolean) },
    put: true,
  });

  async function confirmReset() {
    if (await dialogs.confirm('Delete everything the test nurse and test admin created (visits, notes, alerts, clients, places, photos, mail)? The accounts stay as they are.', { confirmLabel: 'Delete' })) reset.mutate();
  }

  return (
    <section className={styles.panel} aria-labelledby="test-accounts-heading">
      <SectionHeader title="Test accounts" note="A test nurse and a test admin. Mail stays between them and texts never reach real people." />
      {!shown ? <div className={styles.actions}><Button variant="outline" onClick={() => setShown(true)}>Manage test accounts</Button></div> : null}
      {accounts.isError ? <Notice tone="error"><p>{accounts.error instanceof Error ? accounts.error.message : 'Could not load test accounts.'}</p><Button variant="outline" size="compact" onClick={() => void accounts.refetch()}>Try again</Button></Notice> : null}
      {failure ? <Notice tone="error"><p>{failure instanceof Error ? failure.message : 'That did not work.'}</p></Notice> : null}
      {message ? <Notice tone="info"><p>{message}</p></Notice> : null}
      {issued ? <Notice tone="success"><strong>{issued.email} is on.</strong><p>Password (shown once): <code>{issued.password}</code></p></Notice> : null}
      {data ? (
        <>
          <div className={styles.status}>
            <span className={styles.statusLabel}>Master switch</span>
            <span className={cx(styles.pill, config?.enabled && styles.pillOn)}>{config?.enabled ? 'On' : 'Off'}</span>
            <Button size="compact" variant={config?.enabled ? 'outline' : 'primary'} disabled={master.isPending} onClick={() => master.mutate(!config?.enabled)}>
              {config?.enabled ? 'Turn off and delete test data' : 'Turn on'}
            </Button>
          </div>
          {config?.enabled ? (
            <>
              <fieldset className={styles.block}>
                <legend><strong>Where their email and SMS go</strong></legend>
                <p className={styles.help}>Default: nowhere. Choose "Real, to my list only" and your own address or number receives the message, marked [TEST]. Nobody else ever does.</p>
                <div className={styles.fields}>
                  <label className={styles.field}>Emails (up to 5)<input value={emails ?? config.emails.join(', ')} onChange={(e) => setEmails(e.target.value)} placeholder="you@example.com" /></label>
                  <label className={styles.field}>Phones, +country code (up to 5)<input value={phones ?? config.phones.join(', ')} onChange={(e) => setPhones(e.target.value)} placeholder="+256700000000" /></label>
                </div>
                <div className={styles.actions}>
                  <Button variant={config.delivery === 'sink' ? 'primary' : 'outline'} size="compact" disabled={change.isPending} onClick={() => saveDelivery('sink')}>Nowhere</Button>
                  <Button variant={config.delivery === 'allowlist' ? 'primary' : 'outline'} size="compact" disabled={change.isPending} onClick={() => saveDelivery('allowlist')}>Real, to my list only</Button>
                </div>
              </fieldset>
              <div className={styles.block}>
                <h3>Scenario</h3>
                <p className={styles.help}>Sets both accounts and the link in one go.</p>
                <div className={styles.actions}>
                  {Object.entries(data.scenarios).map(([name, label]) => (
                    <Button key={name} variant="outline" size="compact" disabled={change.isPending} onClick={() => change.mutate({ path: '/scenario', body: { name } })}>{label}</Button>
                  ))}
                </div>
              </div>
              <div className={styles.block}>
                <h3>Accounts</h3>
                <ul className={styles.accounts}>
                  {data.items.map((item) => (
                    <li key={item.key} className={styles.account}>
                      <div className={styles.accountHead}>
                        <div>
                          <p className={styles.accountName}>{item.name} <span className={cx(styles.pill, item.active && styles.pillOn)}>{item.active ? 'On' : 'Off'}</span></p>
                          <p className={styles.accountMeta}>{item.kind} · {item.email}</p>
                        </div>
                        <Button variant="outline" size="compact" disabled={toggle.isPending} onClick={() => toggle.mutate({ k: item.key, active: item.active })}>
                          {item.active ? 'Switch off' : 'Switch on'}
                        </Button>
                      </div>
                      <div className={styles.fields}>
                        <label className={styles.field}>Preset
                          <select value={item.preset} onChange={(e) => e.target.value !== 'custom' && change.mutate({ path: `/${item.key}/access`, body: { preset: e.target.value } })}>
                            {item.preset === 'custom' ? <option value="custom">custom</option> : null}
                            {Object.keys(data.presets).map((name) => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </label>
                        <label className={styles.field}>Reach
                          <select value={item.reach} onChange={(e) => change.mutate({ path: `/${item.key}/access`, body: { reach: e.target.value } })}>
                            {data.reaches.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className={styles.actions}>
                        <Button variant="outline" size="compact" onClick={() => { setCustom(custom === item.key ? null : item.key); setDraft(item.scopes); }}>
                          {custom === item.key ? 'Close scopes' : `Scopes (${item.scopes.length})`}
                        </Button>
                      </div>
                      {custom === item.key ? (
                        <div className={styles.scopes}>
                          {data.catalogue.map((s) => (
                            <label key={s.id}>
                              <input type="checkbox" checked={draft.includes(s.id)} onChange={(e) => setDraft(e.target.checked ? [...draft, s.id] : draft.filter((x) => x !== s.id))} />{' '}
                              {s.group}: {s.label} <code>{s.id}</code>
                            </label>
                          ))}
                          <div className={styles.actions}>
                            <Button size="compact" disabled={change.isPending} onClick={() => change.mutate({ path: `/${item.key}/access`, body: { scopes: draft } })}>Save scopes</Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.block}>
                <h3>Supervisor link</h3>
                <p className={styles.status}>
                  <span className={cx(styles.pill, data.linked && styles.pillOn)}>{data.linked ? 'The test admin supervises the test nurse' : 'Not linked'}</span>
                  <Button variant="outline" size="compact" disabled={change.isPending} onClick={() => change.mutate({ path: '/link', body: { supervises: !data.linked } })}>
                    {data.linked ? 'Remove link' : 'Link them'}
                  </Button>
                </p>
              </div>
              {data.client ? <TestClientPanel status={data.client} onChanged={() => void refresh()} /> : null}
              <div className={styles.block}>
                <h3>Clean up</h3>
                <p className={styles.help}>Deletes what the test accounts created. The accounts stay as they are.</p>
                <div className={styles.actions}>
                  <Button variant="outline" size="compact" disabled={reset.isPending} onClick={() => void confirmReset()}>Delete test data now</Button>
                </div>
              </div>
            </>
          ) : <Notice tone="info"><p>Turn the master switch on to set up and open the test accounts.</p></Notice>}
        </>
      ) : null}
    </section>
  );
}
