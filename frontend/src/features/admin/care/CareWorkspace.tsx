import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { ApiError, apiClient } from '../../../lib/api/client';
import './care.css';
import { PlacesPanel } from './places/PlacesPanel';
import { ScheduleVisitPanel } from './visits/ScheduleVisitPanel';
import { VisitReviewPanel } from './visits/VisitReviewPanel';
import { CreateClientPanel } from './clients/CreateClientPanel';
import { ResolveFlagPanel } from './flags/ResolveFlagPanel';
import { DataToolsPanel } from './data/DataToolsPanel';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';

type CareTab =
  | 'nurses'
  | 'clients'
  | 'visits'
  | 'places'
  | 'flags'
  | 'team'
  | 'photos'
  | 'alerts'
  | 'timesheets'
  | 'sos'
  | 'reports'
  | 'settings'
  | 'readiness'
  | 'data';
type RecordRow = Record<string, unknown>;
type ListResponse = { items?: RecordRow[]; total?: number; ready?: boolean };
type VisitReview = {
  visit?: RecordRow;
  events?: RecordRow[];
  notes?: RecordRow[];
  flags?: RecordRow[];
  photos?: RecordRow[];
  annotations?: RecordRow[];
  audit?: RecordRow[];
};
const paths: Record<CareTab, string> = {
  nurses: '/admin/care/nurses',
  clients: '/admin/care/clients',
  visits: '/admin/care/visits',
  places: '/admin/care/clients',
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
};

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function CareWorkspace() {
  const { t } = useTranslation('admin');
  const copy = t('care', { returnObjects: true }) as Record<string, unknown>;
  const [tab, setTab] = useState<CareTab>('clients');
  const [items, setItems] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState('');
  const [selectedFlag, setSelectedFlag] = useState('');
  const [dataClientId, setDataClientId] = useState('');
  const [exportedData, setExportedData] = useState<RecordRow | null>(null);
  const [dataActionMessage, setDataActionMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [placeClientId, setPlaceClientId] = useState('');
  const [placeItems, setPlaceItems] = useState<RecordRow[]>([]);
  const [stayItems, setStayItems] = useState<RecordRow[]>([]);
  const [placeLabel, setPlaceLabel] = useState('Home');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeLat, setPlaceLat] = useState('');
  const [placeLng, setPlaceLng] = useState('');
  const [placeRadius, setPlaceRadius] = useState('150');
  const [stayPlaceId, setStayPlaceId] = useState('');
  const [stayStart, setStayStart] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleClientId, setScheduleClientId] = useState('');
  const [scheduleNurseId, setScheduleNurseId] = useState('');
  const [schedulePlaceId, setSchedulePlaceId] = useState('');
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleInstructions, setScheduleInstructions] = useState('');
  const [reviewVisitId, setReviewVisitId] = useState('');
  const [visitReview, setVisitReview] = useState<VisitReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [annotation, setAnnotation] = useState('');
  const [reviewPhotoPanelOpen, setReviewPhotoPanelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient.get<ListResponse | RecordRow[]>(paths[tab]);
      setItems(Array.isArray(result) ? result : Array.isArray(result.items) ? result.items : []);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : String(copy.error ?? 'Care data could not be loaded.'),
      );
    } finally {
      setLoading(false);
    }
  }, [tab, copy.error]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadClientPlaces = useCallback(async () => {
    if (!placeClientId) {
      setPlaceItems([]);
      setStayItems([]);
      return;
    }
    try {
      const [places, stays] = await Promise.all([
        apiClient.get<ListResponse>(
          `/admin/care/clients/${encodeURIComponent(placeClientId)}/places`,
        ),
        apiClient.get<ListResponse>(
          `/admin/care/clients/${encodeURIComponent(placeClientId)}/stays`,
        ),
      ]);
      setPlaceItems(Array.isArray(places.items) ? places.items : []);
      setStayItems(Array.isArray(stays.items) ? stays.items : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Client places could not be loaded.');
    }
  }, [placeClientId]);

  useEffect(() => {
    if (tab === 'places' && placeClientId) void loadClientPlaces();
  }, [tab, placeClientId, loadClientPlaces]);

  async function createClient(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiClient.post('/admin/care/clients', {
        id: crypto.randomUUID(),
        display_name: name,
        notes_for_nurse: notes,
      });
      setName('');
      setNotes('');
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : String(copy.failed ?? 'The action failed.'),
      );
    }
  }

  async function createPlace(event: FormEvent) {
    event.preventDefault();
    if (!placeClientId) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/care/clients/${encodeURIComponent(placeClientId)}/places`, {
        id: crypto.randomUUID(),
        label: placeLabel,
        address_text: placeAddress,
        lat: Number(placeLat),
        lng: Number(placeLng),
        radius_m: Number(placeRadius),
        is_primary: placeItems.length === 0,
      });
      setPlaceAddress('');
      setPlaceLat('');
      setPlaceLng('');
      await loadClientPlaces();
      setActionMessage('Place created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Place could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function moveClient(event: FormEvent) {
    event.preventDefault();
    if (!placeClientId || !stayPlaceId) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/care/clients/${encodeURIComponent(placeClientId)}/stays`, {
        id: crypto.randomUUID(),
        place_id: stayPlaceId,
        starts_on: stayStart,
      });
      await loadClientPlaces();
      setActionMessage('Client stay updated. The previous open stay is closed by the server.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Client move could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleVisit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/admin/care/visits', {
        id: crypto.randomUUID(),
        client_id: scheduleClientId.trim(),
        nurse_id: scheduleNurseId.trim(),
        place_id: schedulePlaceId.trim(),
        scheduled_start: new Date(scheduleStart).toISOString(),
        scheduled_end: new Date(scheduleEnd).toISOString(),
        instructions: scheduleInstructions,
        confirm_overlap: false,
        adhoc: false,
      });
      setScheduleInstructions('');
      await load();
      setActionMessage('Visit scheduled.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Visit could not be scheduled. Check the IDs, dates, and availability.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function openVisitReview(visitId: string) {
    setReviewVisitId(visitId);
    setVisitReview(null);
    setReviewPhotoPanelOpen(false);
    setReviewLoading(true);
    setError('');
    try {
      const result = await apiClient.get<VisitReview>(
        `/admin/care/visits/${encodeURIComponent(visitId)}`,
      );
      setVisitReview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Visit review could not be loaded.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function saveAnnotation(event: FormEvent) {
    event.preventDefault();
    if (!reviewVisitId || annotation.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/care/visits/${encodeURIComponent(reviewVisitId)}/annotate`, {
        comment: annotation.trim(),
      });
      setAnnotation('');
      await openVisitReview(reviewVisitId);
      setActionMessage('Visit annotation saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Annotation could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveReviewFlag(flagId: string) {
    const reason = window.prompt('Resolution note (at least 3 characters)');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/admin/care/flags/${encodeURIComponent(flagId)}/resolve`, {
        reason: reason.trim(),
      });
      await openVisitReview(reviewVisitId);
      setActionMessage('Flag resolved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Flag could not be resolved.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveFlag(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiClient.post(`/admin/care/flags/${encodeURIComponent(selectedFlag)}/resolve`, {
        reason: resolution,
      });
      setSelectedFlag('');
      setResolution('');
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : String(copy.failed ?? 'The action failed.'),
      );
    }
  }

  async function runRowAction(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    setActionMessage('');
    try {
      await apiClient.post(path, body);
      setActionMessage('Action completed. The list has been refreshed.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function exportClientData() {
    setBusy(true);
    setError('');
    setDataActionMessage('');
    setExportedData(null);
    try {
      const result = await apiClient.get<RecordRow>(
        `/admin/care/data-requests/clients/${encodeURIComponent(dataClientId.trim())}/export`,
      );
      setExportedData(result);
      setDataActionMessage('Client data export loaded. Access has been recorded in the audit log.');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The client data export could not be loaded.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function anonymiseClientData() {
    const clientId = dataClientId.trim();
    if (!clientId) {
      setError('Enter a client ID first.');
      return;
    }
    if (
      !window.confirm(
        'Anonymise this client and delete associated photo assets? This action cannot be undone.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setDataActionMessage('');
    setExportedData(null);
    try {
      const result = await apiClient.post<{ status: string; photos_deleted: number }>(
        `/admin/care/data-requests/clients/${encodeURIComponent(clientId)}/anonymise`,
        {},
      );
      setDataActionMessage(`Client anonymised. Photos deleted: ${result.photos_deleted}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client could not be anonymised.');
    } finally {
      setBusy(false);
    }
  }

  const tabs: CareTab[] = [
    'nurses',
    'clients',
    'visits',
    'places',
    'flags',
    'team',
    'photos',
    'alerts',
    'timesheets',
    'sos',
    'reports',
    'settings',
    'readiness',
    'data',
  ];
  const tabLabels: Record<CareTab, string> = {
    nurses: 'Nurses',
    clients: 'Clients',
    visits: 'Visits',
    places: 'Places',
    flags: 'Flags',
    team: 'Team',
    photos: 'Photo review',
    alerts: 'Alerts',
    timesheets: 'Timesheets',
    sos: 'SOS cases',
    reports: 'Visit reports',
    settings: 'Settings',
    readiness: 'Readiness',
    data: 'Data and retention',
  };

  return (
    <section className="admin-page" aria-labelledby="care-title">
      <header className="page-header">
        <div>
          <h1 id="care-title">{String(copy.title ?? 'Care operations')}</h1>
          <p>{String(copy.subtitle ?? '')}</p>
        </div>
        <Button variant="outline" type="button" onClick={() => void load()} disabled={loading || busy}>
          {String(copy.refresh ?? 'Refresh')}
        </Button>
      </header>
      <FilterTabs
        label="Care sections"
        value={tab}
        onChange={(value) => setTab(value as CareTab)}
        tabs={tabs.map((value) => ({
          value,
          label: String((copy.tabs as Record<string, unknown> | undefined)?.[value] ?? tabLabels[value]),
        }))}
      />
      {error && <p role="alert">{error}</p>}
      {actionMessage && <p role="status">{actionMessage}</p>}
      {loading && <p role="status">{String(copy.loading ?? 'Loading care data')}</p>}

      {tab === 'places' && (
        <PlacesPanel
          clients={items}
          clientId={placeClientId} setClientId={setPlaceClientId}
          places={placeItems} stays={stayItems}
          label={placeLabel} setLabel={setPlaceLabel}
          address={placeAddress} setAddress={setPlaceAddress}
          lat={placeLat} setLat={setPlaceLat}
          lng={placeLng} setLng={setPlaceLng}
          radius={placeRadius} setRadius={setPlaceRadius}
          stayPlaceId={stayPlaceId} setStayPlaceId={setStayPlaceId}
          stayStart={stayStart} setStayStart={setStayStart}
          busy={busy} onCreatePlace={createPlace} onMoveClient={moveClient}
        />
      )}

      {tab === 'visits' && (
        <ScheduleVisitPanel
          clientId={scheduleClientId} setClientId={setScheduleClientId}
          nurseId={scheduleNurseId} setNurseId={setScheduleNurseId}
          placeId={schedulePlaceId} setPlaceId={setSchedulePlaceId}
          start={scheduleStart} setStart={setScheduleStart}
          end={scheduleEnd} setEnd={setScheduleEnd}
          instructions={scheduleInstructions} setInstructions={setScheduleInstructions}
          busy={busy} onSubmit={scheduleVisit}
        />
      )}

      {tab === 'clients' && (
        <CreateClientPanel
          name={name} setName={setName}
          notes={notes} setNotes={setNotes}
          onSubmit={createClient}
          createLabel={String(copy.createClient ?? 'Create client')}
        />
      )}

      {tab === 'flags' && selectedFlag && (
        <ResolveFlagPanel
          resolution={resolution} setResolution={setResolution}
          onSubmit={resolveFlag} onCancel={() => setSelectedFlag('')}
          resolveLabel={String(copy.resolve ?? 'Resolve')}
          cancelLabel="Cancel"
        />
      )}

      {tab === 'data' && (
        <DataToolsPanel
          clientId={dataClientId} setClientId={setDataClientId}
          busy={busy} message={dataActionMessage} exportedData={exportedData}
          onExport={() => void exportClientData()}
          onAnonymise={() => void anonymiseClientData()}
        />
      )}

      {tab === 'visits' && reviewVisitId && (
        <VisitReviewPanel
          visitId={reviewVisitId} review={visitReview}
          loading={reviewLoading} busy={busy}
          photoPanelOpen={reviewPhotoPanelOpen} setPhotoPanelOpen={setReviewPhotoPanelOpen}
          annotation={annotation} setAnnotation={setAnnotation}
          onClose={() => { setReviewVisitId(''); setVisitReview(null); setReviewPhotoPanelOpen(false); }}
          onResolveFlag={(flagId) => void resolveReviewFlag(flagId)}
          onSaveAnnotation={saveAnnotation}
          printable={printable}
        />
      )}

      {items.length === 0 && !loading && tab !== 'data' && tab !== 'places' ? (
        <p>{String(copy.empty ?? 'No records are available for this view.')}</p>
      ) : tab !== 'data' && tab !== 'places' ? (
        <div className="care-table-wrap">
          <table>
            <caption>
              {String((copy.tabs as Record<string, unknown> | undefined)?.[tab] ?? tabLabels[tab])}
            </caption>
            <thead>
              <tr>
                {Object.keys(items[0] ?? {})
                  .filter(
                    (key) =>
                      !['_id', 'created_at', 'updated_at', 'place_snapshot', 'details'].includes(
                        key,
                      ),
                  )
                  .slice(0, 7)
                  .map((key) => (
                    <th key={key} scope="col">
                      {key.replaceAll('_', ' ')}
                    </th>
                  ))}
                {['visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(tab) && (
                  <th scope="col">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={String(item.id ?? item.user_id ?? index)}>
                  {Object.entries(item)
                    .filter(
                      ([key]) =>
                        !['_id', 'created_at', 'updated_at', 'place_snapshot', 'details'].includes(
                          key,
                        ),
                    )
                    .slice(0, 7)
                    .map(([key, value]) => (
                      <td key={key}>{printable(value)}</td>
                    ))}
                  {['visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(tab) && (
                    <td><ButtonGroup size="compact">
                      {tab === 'visits' && (
                        <Button variant="outline"
                          type="button"
                          onClick={() => void openVisitReview(String(item.id ?? ''))}
                        >
                          Review visit
                        </Button>
                      )}
                      {tab === 'visits' && item.status === 'scheduled' && (
                        <>
                          <Button variant="outline"
                            type="button"
                            onClick={() => {
                              const nurseId = window.prompt('New nurse user ID');
                              if (nurseId?.trim()) {
                                setBusy(true);
                                void apiClient
                                  .patch(
                                    `/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}`,
                                    { nurse_id: nurseId.trim() },
                                  )
                                  .then(async () => {
                                    setActionMessage('Visit reassigned.');
                                    await load();
                                  })
                                  .catch((failure) =>
                                    setError(
                                      failure instanceof Error
                                        ? failure.message
                                        : 'Visit could not be reassigned.',
                                    ),
                                  )
                                  .finally(() => setBusy(false));
                              }
                            }}
                          >
                            Reassign
                          </Button>
                          <Button variant="outline"
                            type="button"
                            onClick={() => {
                              const reason = window.prompt('Reason for cancelling this visit');
                              if (reason?.trim())
                                void runRowAction(
                                  `/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}/cancel`,
                                  { reason: reason.trim() },
                                );
                            }}
                          >
                            Cancel visit
                          </Button>
                        </>
                      )}
                      {tab === 'flags' && (
                        <Button variant="outline"
                          type="button"
                          onClick={() => setSelectedFlag(String(item.id ?? ''))}
                        >
                          Resolve
                        </Button>
                      )}
                      {tab === 'photos' &&
                        item.status !== 'hidden' &&
                        item.status !== 'expired' && (
                          <Button variant="outline"
                            type="button"
                            onClick={() => {
                              const id = String(item.id ?? '');
                              const reason = window.prompt('Reason for hiding this photo');
                              if (reason?.trim())
                                void runRowAction(
                                  `/admin/care/photos/${encodeURIComponent(id)}/hide`,
                                  { note: reason.trim() },
                                );
                            }}
                          >
                            Hide photo
                          </Button>
                        )}
                      {tab === 'alerts' && item.status === 'open' && (
                        <>
                          <Button variant="outline"
                            type="button"
                            onClick={() =>
                              void runRowAction(
                                `/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`,
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                          <Button variant="outline"
                            type="button"
                            onClick={() => {
                              const note = window.prompt('Resolution note');
                              if (note?.trim())
                                void runRowAction(
                                  `/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/resolve`,
                                  { note: note.trim() },
                                );
                            }}
                          >
                            Resolve
                          </Button>
                        </>
                      )}
                      {tab === 'timesheets' && item.status === 'submitted' && (
                        <>
                          <Button variant="outline"
                            type="button"
                            onClick={() =>
                              void runRowAction(
                                `/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/approve`,
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button variant="outline"
                            type="button"
                            onClick={() => {
                              const note = window.prompt('Reason for sending back');
                              if (note?.trim())
                                void runRowAction(
                                  `/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/send-back`,
                                  { note: note.trim() },
                                );
                            }}
                          >
                            Send back
                          </Button>
                        </>
                      )}
                      {tab === 'sos' && item.status === 'sent' && (
                        <Button variant="outline"
                          type="button"
                          onClick={() =>
                            void runRowAction(
                              `/admin/care/sos/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`,
                            )
                          }
                        >
                          Acknowledge SOS
                        </Button>
                      )}
                    </ButtonGroup></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
