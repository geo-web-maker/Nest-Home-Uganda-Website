/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, apiClient } from '../../../lib/api/client';
import type { DataColumn } from '../../../components/admin/DataTable';
import { CareTable } from './components/CareTable';
import { CareSheet } from './components/CareSheet';
import { CareScreenNav } from './components/CareScreenNav';
import { InviteNurseSheet } from './nurses/InviteNurseSheet';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { MapPicker } from './components/MapPicker';
import { VisitReviewPage } from './VisitReviewPage';
import { VisitListPage } from './VisitListAndPhotosPages';
import { RequireScopes } from '../auth/guards';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './care.css';
import './care-screen.css';

type Row = Record<string, any>;
type ScreenKey =
  | 'nurses'
  | 'clients'
  | 'places'
  | 'visits'
  | 'flags'
  | 'team'
  | 'photos'
  | 'alerts'
  | 'timesheets'
  | 'sos'
  | 'reports'
  | 'settings'
  | 'readiness'
  | 'data'
  | 'audit';
export const CARE_SCREEN_PATHS: Record<ScreenKey, string> = {
  nurses: 'nurses',
  clients: 'clients',
  places: 'places',
  visits: 'visits',
  flags: 'flags',
  team: 'team',
  photos: 'photos',
  alerts: 'alerts',
  timesheets: 'timesheets',
  sos: 'sos',
  reports: 'reports/visits',
  settings: 'settings',
  readiness: 'readiness',
  data: 'data-requests',
  audit: 'audit',
};
export const CARE_SCREEN_SCOPES: Record<ScreenKey, string[]> = {
  nurses: ['nurses:read'],
  clients: ['clients:read'],
  places: ['places:read'],
  visits: ['visits:read'],
  flags: ['flags:read'],
  team: ['visits:read'],
  photos: ['photos:read'],
  alerts: ['alerts:read'],
  timesheets: ['timesheets:read'],
  sos: ['alerts:read'],
  reports: ['care-reports:read'],
  settings: ['carecfg:read'],
  readiness: ['carecfg:read'],
  data: ['system:manage'],
  audit: ['activity:read'],
};
const endpoint: Record<ScreenKey, string> = {
  nurses: '/admin/care/nurses',
  clients: '/admin/care/clients',
  places: '/admin/care/clients',
  visits: '/admin/care/visits',
  flags: '/admin/care/flags',
  team: '/admin/care/team',
  photos: '/admin/care/photos',
  alerts: '/admin/care/alerts',
  timesheets: '/admin/care/timesheets',
  sos: '/admin/care/sos',
  reports: '/admin/care/reports/visits',
  settings: '/admin/care/settings',
  readiness: '/admin/care/readiness',
  data: '/admin/care/data-requests',
  audit: '/admin/activity',
};
const titles: Record<ScreenKey, string> = {
  nurses: 'Nurses',
  clients: 'Clients',
  places: 'Places & stays',
  visits: 'Visit schedule & review',
  flags: 'Flags queue',
  team: 'Team status',
  photos: 'Photo review',
  alerts: 'Alerts dashboard',
  timesheets: 'Timesheets',
  sos: 'SOS & on-call',
  reports: 'Care reports',
  settings: 'Care settings',
  readiness: 'Care readiness',
  data: 'Data requests',
  audit: 'Audit history',
};
const actionText = (v: any) =>
  v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

export function CareScreenPage({ screen }: { screen: ScreenKey }) {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [auditFilters, setAuditFilters] = useState({
    actor: '',
    entity: '',
    entityId: '',
    from: '',
    to: '',
    cursor: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result: any = await apiClient.get(endpoint[screen], {
        params:
          screen === 'audit'
            ? {
                actor_id: auditFilters.actor || undefined,
                item_type: auditFilters.entity || undefined,
                item_id: auditFilters.entityId || undefined,
                from: auditFilters.from || undefined,
                to: auditFilters.to || undefined,
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
      if (screen === 'readiness') setReadiness(result);
      if (screen === 'visits') {
        const c: any = await apiClient.get('/admin/care/clients');
        const n: any = await apiClient.get('/admin/care/nurses');
        setClientOptions(c.items ?? c ?? []);
        setNurseOptions(n.items ?? n ?? []);
        if (clientId) {
          const p: any = await apiClient.get(
            `/admin/care/clients/${encodeURIComponent(clientId)}/places`,
          );
          setPlaceOptions(p.items ?? []);
        }
      }
      if (screen === 'places') {
        try {
          const cfg: any = await apiClient.get('/admin/care/settings');
          const map = cfg.items?.find((x: any) => x.id === 'care.map_tile_url');
          setMapTileUrl(String(map?.value ?? ''));
        } catch {
          setMapTileUrl('');
        }
      }
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed',
      );
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
  const columns: DataColumn<Row>[] = (() => {
    const keys = visibleRows
      .slice(0, 8)
      .flatMap((r) => Object.keys(r))
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
    const base = (keys.length ? keys : ['id', 'status', 'name', 'created_at']).map((key) => ({
      key,
      header: key.replaceAll('_', ' '),
      cell: (r: Row) => actionText(r[key]),
    }));
    if (['nurses', 'clients', 'visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(screen))
      base.push({
        key: 'actions',
        header: 'Actions',
        cell: (r: Row) => (
          <span className="care-row-actions">
            {screen === 'clients' && (
              <Button type="button" variant="outline" onClick={() => navigate(`/admin/care/clients/${encodeURIComponent(String(r.id ?? ''))}`)}>
                Details
              </Button>
            )}
            {screen === 'nurses' && (
              <>
                <Button type="button" variant="outline" onClick={() => navigate(`/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}`)}>
                  Details
                </Button>
                {hasScopes(user, ['nurses:write']) && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        act(`/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}/invite`)
                      }
                    >
                      Resend invite
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const device = window.prompt('Device ID to revoke');
                        if (device)
                          void act(
                            `/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}/revoke-device`,
                            { device_id: device },
                          );
                      }}
                    >
                      Revoke device
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void act(
                          `/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}`,
                          { active: !r.active },
                          'patch',
                        )
                      }
                    >
                      {r.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const supervisor = window.prompt('Supervisor ID (blank clears)');
                        void act(
                          `/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}/supervisor`,
                          { supervisor_id: supervisor?.trim() || null },
                          'patch',
                        );
                      }}
                    >
                      Supervisor
                    </Button>
                  </>
                )}
              </>
            )}
            {screen === 'visits' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigate(`/admin/care/visits/${encodeURIComponent(String(r.id ?? ''))}`)
                  }
                >
                  Review
                </Button>
                {hasScopes(user, ['visits:write']) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const nurse = window.prompt('Replacement nurse ID');
                      if (nurse)
                        void act(
                          `/admin/care/visits/${encodeURIComponent(String(r.id ?? ''))}`,
                          { nurse_id: nurse },
                          'patch',
                        );
                    }}
                  >
                    Reassign
                  </Button>
                )}
              </>
            )}
            {screen === 'flags' && hasScopes(user, ['flags:write']) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const note = window.prompt('Resolution note (required)');
                  if (note && note.trim().length >= 3)
                    void act(
                      `/admin/care/flags/${encodeURIComponent(String(r.id ?? ''))}/resolve`,
                      { reason: note.trim() },
                    );
                }}
              >
                Resolve
              </Button>
            )}
            {screen === 'photos' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result: any = await apiClient.get(
                        `/admin/care/visits/${encodeURIComponent(String(r.visit_id ?? ''))}/photos`,
                      );
                      const photo = (result.items ?? []).find((x: any) => x.id === r.id);
                      setSelected(photo ?? r);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Photo could not be opened.');
                    }
                  }}
                >
                  View
                </Button>
                {hasScopes(user, ['photos:hide']) && (
                  <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const note = window.prompt('Reason for hiding this photo (required)');
                    if (note && note.trim().length >= 3)
                      void act(
                        `/admin/care/photos/${encodeURIComponent(String(r.id ?? ''))}/hide`,
                        { note: note.trim() },
                      );
                  }}
                  >
                    Hide
                  </Button>
                )}
              </>
            )}
            {screen === 'alerts' && hasScopes(user, ['alerts:write']) && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void act(
                      `/admin/care/alerts/${encodeURIComponent(String(r.id ?? ''))}/acknowledge`,
                    )
                  }
                >
                  Acknowledge
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const note = window.prompt('Resolution note (required)');
                    if (note && note.trim().length >= 3)
                      void act(
                        `/admin/care/alerts/${encodeURIComponent(String(r.id ?? ''))}/resolve`,
                        { note: note.trim() },
                      );
                  }}
                >
                  Resolve
                </Button>
              </>
            )}
            {screen === 'timesheets' && hasScopes(user, ['timesheets:write']) && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void act(
                      `/admin/care/timesheets/${encodeURIComponent(String(r.id ?? ''))}/approve`,
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const note = window.prompt('Reason for sending back (required)');
                    if (note && note.trim().length >= 3)
                      void act(
                        `/admin/care/timesheets/${encodeURIComponent(String(r.id ?? ''))}/send-back`,
                        { note: note.trim() },
                      );
                  }}
                >
                  Send back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const minutes = window.prompt('Adjustment minutes');
                    const reason = window.prompt('Adjustment reason (required)');
                    if (minutes && reason && reason.trim().length >= 3)
                      void act(
                        `/admin/care/timesheets/${encodeURIComponent(String(r.id ?? ''))}/adjust`,
                        { minutes: Number(minutes), reason: reason.trim() },
                      );
                  }}
                >
                  Adjust
                </Button>
              </>
            )}
            {screen === 'sos' && hasScopes(user, ['alerts:write']) && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void act(`/admin/care/sos/${encodeURIComponent(String(r.id ?? ''))}/acknowledge`)
                }
              >
                Acknowledge
              </Button>
            )}
          </span>
        ),
      } as any);
    return base as DataColumn<Row>[];
  })();
  async function act(path: string, body: Row = {}, method: 'post' | 'patch' | 'put' = 'post') {
    try {
      setNotice('');
      if (method === 'patch') await apiClient.patch(path, body);
      else if (method === 'put') await apiClient.put(path, body);
      else await apiClient.post(path, body);
      setNotice('Action completed.');
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Action failed',
      );
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
            });
            f.reset();
          }}
        >
          <Field label={t('care.clientName')} name="name" required requiredLabel="required" />
          <Field label={t('care.clientNotes')} name="notes" kind="textarea" />
          <Button type="submit">Create client</Button>
        </form>
      );
    if (screen === 'places' && (hasScopes(user, ['places:write']) || hasScopes(user, ['clients:write'])))
      return (
        <div className="care-form">
          <Field
            label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            requiredLabel="required"
          />
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
                {x.staff_number ?? x.user_id ?? x.id}
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
        </div>
      );
    if (screen === 'sos')
      return (
        <div className="care-actions">
          {hasScopes(user, ['carecfg:write']) && (
            <Button type="button" onClick={() => act('/admin/care/sos/test-sms')}>
              Send test SMS
            </Button>
          )}
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
        <div className="care-actions">
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
          <Button type="button" onClick={() => void load()}>
            Preview
          </Button>
          {hasScopes(user, ['care-reports:export']) && (
            <Button
              type="button"
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
          <p>
            Exports are audited and require <code>care-reports:export</code>.
          </p>
        </div>
      );
    if (screen === 'audit')
      return (
        <div className="care-form">
          <div className="care-grid">
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
          </div>
          <Button type="button" onClick={() => void load()}>
            Apply filters
          </Button>
        </div>
      );
    if (screen === 'settings')
      return (
        <div className="care-settings">
          {settings.map((s) => (
            <form
              key={s.id}
              className="care-setting"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!hasScopes(user, ['carecfg:write'])) return;
                const input = e.currentTarget.elements.namedItem('value') as HTMLInputElement;
                let value: any = input.value;
                if (s.type === 'boolean') value = input.checked;
                if (s.type === 'integer') value = Number(input.value);
                await act(`/admin/care/settings/${encodeURIComponent(s.id)}`, { value }, 'put');
              }}
            >
              <Field
                label={s.id}
                name="value"
                defaultValue={s.type === 'boolean' ? undefined : s.value}
                type={s.type === 'integer' ? 'number' : 'text'}
                disabled={!hasScopes(user, ['carecfg:write'])}
              />
              {s.type === 'boolean' && (
                <input
                  aria-label={`${s.id} enabled`}
                  name="value"
                  type="checkbox"
                  defaultChecked={Boolean(s.value)}
                  disabled={!hasScopes(user, ['carecfg:write'])}
                />
              )}
              <small>
                Source: {s.source}; group: {s.group}
              </small>
              {hasScopes(user, ['carecfg:write']) && <Button type="submit">Save</Button>}
            </form>
          ))}
        </div>
      );
    if (screen === 'readiness')
      return (
        <div className="care-readiness">
          <strong>{readiness?.ready ? 'Ready' : 'Not ready'}</strong>
          {(readiness?.items ?? []).map((item: any) => (
            <div key={item.id} className="care-check">
              <b>{item.status}</b>
              <span>{item.label}</span>
              {item.detail && <small>{item.detail}</small>}
            </div>
          ))}
        </div>
      );
    if (screen === 'data')
      return (
        <div className="care-form">
          <Field label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <Button
            type="button"
            onClick={async () => {
              const r: any = await apiClient.get(
                `/admin/care/data-requests/clients/${encodeURIComponent(clientId)}/export`,
              );
              setSelected(r);
              setNotice('Client data export prepared and audited.');
            }}
          >
            Preview export
          </Button>
          {selected && <pre>{JSON.stringify(selected, null, 2)}</pre>}
        </div>
      );
    return null;
  }
  return (
    <>
      <PageHeader
        title={titles[screen]}
        subtitle={t('care.subtitle')}
        actions={
          <Button variant="outline" onClick={() => void load()}>
            {t('care.refresh')}
          </Button>
        }
      />
      <CareScreenNav
        active={screen}
        links={(Object.keys(CARE_SCREEN_PATHS) as ScreenKey[])
          .filter((key) => key !== 'audit' && hasScopes(user, CARE_SCREEN_SCOPES[key]))
          .map((key) => ({
            value: key,
            label: titles[key],
            path: `/admin/care/${CARE_SCREEN_PATHS[key]}`,
          }))}
        onChange={navigate}
      />
      {error && (
        <div role="alert" className="care-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="care-notice">
          {notice}
        </div>
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
      {screen === 'photos' && (
        <p className="care-note">
          Photos are private by default. Open a row to request its short-lived audited stream;
          hidden/expired photos are excluded.
        </p>
      )}
      {screen === 'timesheets' && (
        <p className="care-note">
          Approved timesheets are locked. Export is available only after approval.
        </p>
      )}
      {screen === 'flags' && (
        <Field label="Search flags" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {screen !== 'settings' && screen !== 'readiness' && screen !== 'data' && (
        <>
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

export function CareScreenRouter() {
  const location = useLocation();
  const tail = location.pathname.replace(/^\/admin\/care\/?/, '');
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
