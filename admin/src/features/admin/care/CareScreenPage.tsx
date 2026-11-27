/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient, takeQueuedFlag } from '@shared/lib/api/client';
import { useCachedGet, savedLabel } from '../../../admin-native/cachedGet';
import { friendlyError } from '../../../admin-native/connection';
import { CareTable } from './components/CareTable';
import { CareSheet } from './components/CareSheet';
import { CareSettingsPanel, CareReadinessPanel, CareDataRequestPanel } from './components/CareScreenPanels';
import { buildCareScreenColumns } from './components/CareScreenColumns';
import { CARE_SCREEN_PATHS, CARE_SCREEN_SCOPES, endpoint, titles, type ScreenKey } from './careScreenConfig';
import { CreateNurseSheet } from './nurses/CreateNurseSheet';
import { InviteNurseSheet } from './nurses/InviteNurseSheet';
import { FilterBar } from '../../../components/admin/FilterBar';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { MapPicker } from './components/MapPicker';
import { VisitReviewPage } from './VisitReviewPage';
import { VisitListPage } from './VisitListAndPhotosPages';
import { RequireScopes } from '../auth/guards';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './care.css';
import './care-screen.css';
import { Notice } from '@shared/components/dialogs/Notice';
import { TotpGate } from '@shared/components/security/TotpGate';

export { CARE_SCREEN_PATHS, CARE_SCREEN_SCOPES };

type Row = Record<string, any>;
function CareScreenContent({ screen }: { screen: ScreenKey }) {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { get, staleAt } = useCachedGet();
  const [rows, setRows] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [mapTileUrl, setMapTileUrl] = useState('');
  const [coords, setCoords] = useState({ lat: '', lng: '', radius: '150' });
  const [clientOptions, setClientOptions] = useState<Row[]>([]);
  const [agreementOptions, setAgreementOptions] = useState<Row[]>([]);
  const [nurseOptions, setNurseOptions] = useState<Row[]>([]);
  const [placeOptions, setPlaceOptions] = useState<Row[]>([]);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [stayPlaceId, setStayPlaceId] = useState('');
  const [stayStart, setStayStart] = useState('');
  const [clientId, setClientId] = useState('');
  const [nurseId, setNurseId] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [settings, setSettings] = useState<Row[]>([]);
  const [readiness, setReadiness] = useState<Row | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [auditFilters, setAuditFilters] = useState({
    actor: '',
    entity: '',
    entityId: '',
    from: '',
    to: '',
    severity: '',
    eventType: '',
    source: '',
    outcome: '',
    cursor: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result: any = await get(endpoint[screen], {
        params:
          screen === 'audit'
            ? {
                actor_id: auditFilters.actor || undefined,
                item_type: auditFilters.entity || undefined,
                item_id: auditFilters.entityId || undefined,
                from: auditFilters.from || undefined,
                to: auditFilters.to || undefined,
                severity: auditFilters.severity || undefined,
                event_type: auditFilters.eventType || undefined,
                source: auditFilters.source || undefined,
                outcome: auditFilters.outcome || undefined,
                cursor: auditFilters.cursor || undefined,
                page_size: 25,
              }
            : screen === 'visits'
              ? {
                  status: filter || undefined,
                  nurse_id: nurseId || undefined,
                  client_id: clientId || undefined,
                }
              : screen === 'reports'
                ? {
                    nurse: nurseId || undefined,
                    client: clientId || undefined,
                    from: reportFrom || undefined,
                    to: reportTo || undefined,
                    format: 'json',
                  }
                : screen === 'alerts'
                  ? { status: filter || 'open' }
                  : screen === 'timesheets'
                    ? { nurse_id: nurseId || undefined, status: filter || undefined }
                    : undefined,
      });
      setRows(Array.isArray(result) ? result : (result.items ?? []));
      setNextCursor(result.next_cursor ?? '');
      if (screen === 'settings') setSettings(result.items ?? []);
      if (screen === 'clients' && hasScopes(user, ['clients:write']) && hasScopes(user, ['agreements:read'])) {
        try {
          const agreements: any = await get('/admin/agreements', { params: { status: 'completed', limit: 100 } });
          setAgreementOptions(agreements.items ?? []);
        } catch { setAgreementOptions([]); }
      }
      if (screen === 'readiness') setReadiness(result);
      if (screen === 'visits') {
        const c: any = await get('/admin/care/clients');
        const n: any = await get('/admin/care/nurses');
        setClientOptions(c.items ?? c ?? []);
        setNurseOptions(n.items ?? n ?? []);
        if (clientId) {
          const p: any = await get(
            `/admin/care/clients/${encodeURIComponent(clientId)}/places`,
          );
          setPlaceOptions(p.items ?? []);
        }
      }
      if (screen === 'places') {
        try {
          const cfg: any = await get('/admin/care/settings');
          const map = cfg.items?.find((x: any) => x.id === 'care.map_tile_url');
          setMapTileUrl(String(map?.value ?? ''));
        } catch {
          setMapTileUrl('');
        }
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, filter, nurseId, clientId, reportFrom, reportTo, auditFilters.cursor]);
  const visibleRows = useMemo(
    () =>
      filter && !['visits', 'alerts', 'timesheets'].includes(screen)
        ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()))
        : rows,
    [rows, filter, screen],
  );
  const columns = buildCareScreenColumns({
    screen,
    visibleRows,
    user,
    navigate,
    setSelected,
    setNotice,
    setError,
    load,
    act,
  });
  async function act(path: string, body: Row = {}, method: 'post' | 'patch' | 'put' = 'post') {
    try {
      setNotice('');
      if (method === 'patch') await apiClient.patch(path, body);
      else if (method === 'put') await apiClient.put(path, body);
      else await apiClient.post(path, body);
      if (takeQueuedFlag()) { setNotice('Saved on this device. It will send when the connection returns.'); return; }
      setNotice('Action completed.');
      await load();
    } catch (e) {
      setError(friendlyError(e, 'Action failed'));
    }
  }
  function renderForm() {
    if (screen === 'clients' && hasScopes(user, ['clients:write']))
      return (
        <form
          className="care-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const data = new FormData(f);
            await act('/admin/care/clients', {
              id: crypto.randomUUID(),
              display_name: String(data.get('name') || ''),
              notes_for_nurse: String(data.get('notes') || ''),
              patient_type: String(data.get('patient_type') || 'General'),
              agreement_id: String(data.get('agreement_id') || '') || null,
            });
            f.reset();
          }}
        >
          <Field label={t('care.clientName')} name="name" required requiredLabel="required" />
          <Field label={t('care.clientNotes')} name="notes" kind="textarea" />
          <Field kind="select" label="Patient type" name="patient_type" defaultValue="General">
            <option value="Mama">Mama</option><option value="Baby">Baby</option><option value="General">General</option>
          </Field>
          {hasScopes(user, ['agreements:read']) && <Field kind="select" label="Completed agreement" name="agreement_id" defaultValue="">
            <option value="">No linked agreement</option>
            {agreementOptions.map((agreement) => (
            <option key={agreement.id} value={agreement.id}>
              {agreement.reference ?? agreement.id}
              {agreement.patient_name || agreement.client_name
                ? ` · ${agreement.patient_name ?? agreement.client_name}`
                : ''}
            </option>
          ))}
          </Field>}
          <Button type="submit">Create client</Button>
        </form>
      );
    if (screen === 'places' && (hasScopes(user, ['places:write']) || hasScopes(user, ['clients:write'])))
      return (
        <div className="care-form care-places">
          <section className="care-places-pick" aria-labelledby="places-pin-title">
          <h3 id="places-pin-title">1 · Pin the client’s location</h3>
          <Field
            kind="select"
            label="Client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            requiredLabel="required"
          >
            <option value="">Choose a client</option>
            {rows.map((x) => (
              <option key={String(x.id)} value={String(x.id)}>
                {String(x.display_name ?? x.name ?? x.id)}
              </option>
            ))}
          </Field>
          {hasScopes(user, ['places:write']) && (
            <>
              <MapPicker
                tileUrl={mapTileUrl}
                lat={coords.lat}
                lng={coords.lng}
                radius={coords.radius}
                onChange={setCoords}
              />
              <Button
                type="button"
                onClick={async () => {
                  if (!clientId) return;
                  await act(`/admin/care/clients/${encodeURIComponent(clientId)}/places`, {
                    id: crypto.randomUUID(),
                    label: 'Home',
                    address_text: '',
                    lat: Number(coords.lat),
                    lng: Number(coords.lng),
                    radius_m: Number(coords.radius),
                    is_primary: true,
                  });
                }}
              >
                Add place
              </Button>
            </>
          )}
          </section>
          <section className="care-places-stay" aria-labelledby="places-stay-title">
          <h3 id="places-stay-title">2 · Record where the client is staying</h3>
          <Field
            label="Place ID for stay"
            value={stayPlaceId}
            onChange={(e) => setStayPlaceId(e.target.value)}
          />
          <Field
            label="Stay start"
            type="date"
            value={stayStart}
            onChange={(e) => setStayStart(e.target.value)}
          />
          {hasScopes(user, ['clients:write']) && (
            <Button
              type="button"
              onClick={() => {
                if (clientId && stayPlaceId && stayStart)
                  void act(`/admin/care/clients/${encodeURIComponent(clientId)}/stays`, {
                    id: crypto.randomUUID(),
                    place_id: stayPlaceId,
                    starts_on: stayStart,
                  });
              }}
            >
              Move client
            </Button>
          )}
          </section>
        </div>
      );
    if (screen === 'visits' && hasScopes(user, ['visits:write']))
      return (
        <form
          className="care-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await act('/admin/care/visits', {
              id: crypto.randomUUID(),
              client_id: clientId,
              nurse_id: nurseId,
              place_id: placeId,
              scheduled_start: new Date(start).toISOString(),
              scheduled_end: new Date(end).toISOString(),
              instructions: '',
              confirm_overlap: false,
              adhoc: false,
            });
          }}
        >
          <Field
            kind="select"
            label="Client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            requiredLabel="required"
          >
            <option value="">Select client</option>
            {clientOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.display_name ?? x.name ?? x.id}
              </option>
            ))}
          </Field>
          <Field
            kind="select"
            label="Nurse"
            value={nurseId}
            onChange={(e) => setNurseId(e.target.value)}
            required
            requiredLabel="required"
          >
            <option value="">Select nurse</option>
            {nurseOptions.map((x) => (
              <option key={x.user_id ?? x.id} value={x.user_id ?? x.id}>
                {x.name ?? x.staff_number ?? x.user_id ?? x.id}
              </option>
            ))}
          </Field>
          <Field
            kind="select"
            label="Place"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            required
            requiredLabel="required"
          >
            <option value="">Select place</option>
            {placeOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label ?? x.id}
              </option>
            ))}
          </Field>
          <Field
            label="Start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            requiredLabel="required"
          />
          <Field
            label="End"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            requiredLabel="required"
          />
          <Button type="submit">Schedule visit</Button>
        </form>
      );
    if (screen === 'nurses')
      return (
        <div className="care-form">
          <h2>Nurse accounts</h2>
          <p>Open a nurse profile to review assignments, registered devices, and consent records.</p>
          {hasScopes(user, ['nurses:write']) && (
            <Button type="button" onClick={() => setInviteOpen(true)}>Invite nurse</Button>
          )}
          {user?.is_superadmin && (
            <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>Create nurse with password</Button>
          )}
        </div>
      );
    if (screen === 'sos')
      return (
        <div className="care-actions">
          {hasScopes(user, ['carecfg:write']) && <form
            onSubmit={async (e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('roster') as HTMLTextAreaElement;
              try {
                const value = JSON.parse(input.value);
                await act('/admin/care/settings/sos.on_call_contacts', { value }, 'put');
              } catch {
                setError('On-call roster must be valid JSON.');
              }
            }}
          >
            <Field label="On-call roster JSON" name="roster" kind="textarea" defaultValue="{}" />
            <Button type="submit">Save roster</Button>
          </form>}
          <p>
            Test delivery uses the configured <code>sms.test_number</code> and does not create an
            SOS case.
          </p>
        </div>
      );
    if (screen === 'reports')
      return (
        <>
        <FilterBar
          label="Visit report filters"
          onSubmit={() => void load()}
          actions={
            <>
              <Button type="submit">Preview</Button>
              {hasScopes(user, ['care-reports:export']) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const q = new URLSearchParams({ format: 'csv' });
                    if (nurseId) q.set('nurse', nurseId);
                    if (clientId) q.set('client', clientId);
                    if (reportFrom) q.set('from', reportFrom);
                    if (reportTo) q.set('to', reportTo);
                    window.location.assign(`/api/v1/admin/care/reports/visits?${q.toString()}`);
                  }}
                >
                  Download CSV
                </Button>
              )}
            </>
          }
        >
          <Field label="Nurse ID" value={nurseId} onChange={(e) => setNurseId(e.target.value)} />
          <Field label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <Field
            label="From"
            type="date"
            value={reportFrom}
            onChange={(e) => setReportFrom(e.target.value)}
          />
          <Field
            label="To"
            type="date"
            value={reportTo}
            onChange={(e) => setReportTo(e.target.value)}
          />
        </FilterBar>
          <p className="stage-muted">
            Exports are audited and require <code>care-reports:export</code>.
          </p>
        </>
      );
    if (screen === 'audit')
      return (
        <FilterBar
          label="Audit filters"
          onSubmit={() => void load()}
          actions={<Button type="submit">Apply filters</Button>}
        >
            <Field
              label="Actor ID"
              value={auditFilters.actor}
              onChange={(e) =>
                setAuditFilters({ ...auditFilters, actor: e.target.value, cursor: '' })
              }
            />
            <Field
              label="Entity type"
              value={auditFilters.entity}
              onChange={(e) =>
                setAuditFilters({ ...auditFilters, entity: e.target.value, cursor: '' })
              }
            />
            <Field
              label="Entity ID"
              value={auditFilters.entityId}
              onChange={(e) =>
                setAuditFilters({ ...auditFilters, entityId: e.target.value, cursor: '' })
              }
            />
            <Field
              label="From"
              type="date"
              value={auditFilters.from}
              onChange={(e) =>
                setAuditFilters({ ...auditFilters, from: e.target.value, cursor: '' })
              }
            />
            <Field
              label="To"
              type="date"
              value={auditFilters.to}
              onChange={(e) => setAuditFilters({ ...auditFilters, to: e.target.value, cursor: '' })}
            />
            <Field
              label="Severity"
              value={auditFilters.severity}
              onChange={(e) => setAuditFilters({ ...auditFilters, severity: e.target.value, cursor: '' })}
              placeholder="info / warning / error / critical"
            />
            <Field
              label="Event type"
              value={auditFilters.eventType}
              onChange={(e) => setAuditFilters({ ...auditFilters, eventType: e.target.value, cursor: '' })}
              placeholder="activity / error / security / system"
            />
            <Field
              label="Source"
              value={auditFilters.source}
              onChange={(e) => setAuditFilters({ ...auditFilters, source: e.target.value, cursor: '' })}
              placeholder="user / api / scheduler / integration"
            />
            <Field
              label="Outcome"
              value={auditFilters.outcome}
              onChange={(e) => setAuditFilters({ ...auditFilters, outcome: e.target.value, cursor: '' })}
              placeholder="success / failure / blocked"
            />
        </FilterBar>
      );
    if (screen === 'settings')
      return (
        <CareSettingsPanel
          settings={settings}
          canWrite={hasScopes(user, ['carecfg:write'])}
          canRead={hasScopes(user, ['carecfg:read'])}
          onSave={(id, value) => act(`/admin/care/settings/${encodeURIComponent(id)}`, { value }, 'put')}
        />
      );
    if (screen === 'readiness')
      return <CareReadinessPanel readiness={readiness} />;
    if (screen === 'data')
      return (
        <CareDataRequestPanel
          clientId={clientId}
          selected={selected}
          onClientIdChange={setClientId}
          onPreview={async () => {
            const result: any = await apiClient.get(
              `/admin/care/data-requests/clients/${encodeURIComponent(clientId)}/export`,
            );
            setSelected(result);
            setNotice('Client data export prepared and audited.');
          }}
        />
      );
    return null;
  }
  return (
    <>
      <PageHeader
        title={titles[screen]}
        actions={
          <Button variant="outline" onClick={() => void load()}>
            {t('care.refresh')}
          </Button>
        }
      />
      {staleAt && <Notice role={null}>{savedLabel(staleAt)}</Notice>}
      {error && (
        <Notice tone="error">
          {error}
        </Notice>
      )}
      {notice && (
        <Notice>
          {notice}
        </Notice>
      )}
      {renderForm()}
      {screen === 'nurses' && inviteOpen && (
        <InviteNurseSheet
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            setNotice('Nurse invitation created.');
            void load();
          }}
        />
      )}
      {screen === 'nurses' && createOpen && (
        <CreateNurseSheet
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setNotice('Nurse account created. They can sign in with the password you set.');
            void load();
          }}
        />
      )}
      {screen === 'photos' && (
        <Notice tone="success" role={null}>
          Photos are private by default. Open a row to request its short-lived audited stream;
          hidden/expired photos are excluded.
        </Notice>
      )}
      {screen === 'timesheets' && (
        <Notice tone="success" role={null}>
          Approved timesheets are locked. Export is available only after approval.
        </Notice>
      )}
      {screen === 'flags' && (
        <Field label="Search flags" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {screen !== 'settings' && screen !== 'readiness' && screen !== 'data' && (
        <>
          {screen === 'places' && <h2 className="care-places-list-title">Clients and their places</h2>}
          <CareTable
            columns={columns}
            rows={visibleRows}
            getRowKey={(r) => String(r.id ?? JSON.stringify(r))}
            loading={loading}
            labels={{
              caption: `${titles[screen]} table`,
              loading: 'Loading',
              empty: t('care.empty'),
            }}
          />
          {screen === 'audit' && nextCursor && (
            <Button
              type="button"
              onClick={() => setAuditFilters({ ...auditFilters, cursor: nextCursor })}
            >
              Next page
            </Button>
          )}
        </>
      )}
      {selected && screen !== 'data' && (
        <CareSheet title={`${titles[screen]} details`} onClose={() => setSelected(null)}>
          {screen === 'photos' && selected.original_path?.path && (
            <img
              src={selected.original_path.path}
              alt="Private visit photo"
              loading="lazy"
              style={{ maxWidth: '100%', borderRadius: 8 }}
            />
          )}
          <pre>{JSON.stringify(selected, null, 2)}</pre>
        </CareSheet>
      )}
    </>
  );
}

export function CareScreenPage({ screen }: { screen: ScreenKey }) {
  return screen === 'audit'
    ? <TotpGate><CareScreenContent screen={screen} /></TotpGate>
    : <CareScreenContent screen={screen} />;
}

export function CareScreenRouter() {
  const location = useLocation();
  const tail = location.pathname.replace(/^\/care\/?/, '');
  if (tail === 'visits')
    return (
      <RequireScopes scopes={CARE_SCREEN_SCOPES.visits}>
        <VisitListPage />
      </RequireScopes>
    );
  if (tail.startsWith('visits/') && tail !== 'visits/')
    return (
      <RequireScopes scopes={CARE_SCREEN_SCOPES.visits}>
        <VisitReviewPage />
      </RequireScopes>
    );
  const screen = (Object.entries(CARE_SCREEN_PATHS).find(
    ([, p]) => tail === p || tail.startsWith(`${p}/`),
  )?.[0] ?? 'clients') as ScreenKey;
  return (
    <RequireScopes scopes={CARE_SCREEN_SCOPES[screen]}>
      <CareScreenPage screen={screen} />
    </RequireScopes>
  );
}
