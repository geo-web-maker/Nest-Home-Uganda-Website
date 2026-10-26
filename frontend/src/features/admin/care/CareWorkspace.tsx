import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, apiClient } from '../../../lib/api/client';
import './care.css';

type CareTab = 'nurses' | 'clients' | 'visits' | 'places' | 'flags' | 'team' | 'photos' | 'alerts' | 'timesheets' | 'sos' | 'reports' | 'settings' | 'readiness' | 'data';
type RecordRow = Record<string, unknown>;
type ListResponse = { items?: RecordRow[]; total?: number; ready?: boolean };
type VisitReview = { visit?: RecordRow; events?: RecordRow[]; notes?: RecordRow[]; flags?: RecordRow[]; photos?: RecordRow[]; annotations?: RecordRow[]; audit?: RecordRow[] };
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
      setError(reason instanceof ApiError ? reason.message : String(copy.error ?? 'Care data could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [tab, copy.error]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadClientPlaces = useCallback(async () => {
    if (!placeClientId) { setPlaceItems([]); setStayItems([]); return; }
    try {
      const [places, stays] = await Promise.all([
        apiClient.get<ListResponse>(`/admin/care/clients/${encodeURIComponent(placeClientId)}/places`),
        apiClient.get<ListResponse>(`/admin/care/clients/${encodeURIComponent(placeClientId)}/stays`),
      ]);
      setPlaceItems(Array.isArray(places.items) ? places.items : []);
      setStayItems(Array.isArray(stays.items) ? stays.items : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Client places could not be loaded.'); }
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
      setError(reason instanceof Error ? reason.message : String(copy.failed ?? 'The action failed.'));
    }
  }

  async function createPlace(event: FormEvent) {
    event.preventDefault();
    if (!placeClientId) return;
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/care/clients/${encodeURIComponent(placeClientId)}/places`, {
        id: crypto.randomUUID(), label: placeLabel, address_text: placeAddress,
        lat: Number(placeLat), lng: Number(placeLng), radius_m: Number(placeRadius), is_primary: placeItems.length === 0,
      });
      setPlaceAddress(''); setPlaceLat(''); setPlaceLng(''); await loadClientPlaces();
      setActionMessage('Place created.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Place could not be created.'); }
    finally { setBusy(false); }
  }

  async function moveClient(event: FormEvent) {
    event.preventDefault();
    if (!placeClientId || !stayPlaceId) return;
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/care/clients/${encodeURIComponent(placeClientId)}/stays`, { id: crypto.randomUUID(), place_id: stayPlaceId, starts_on: stayStart });
      await loadClientPlaces(); setActionMessage('Client stay updated. The previous open stay is closed by the server.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Client move could not be saved.'); }
    finally { setBusy(false); }
  }

  async function scheduleVisit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await apiClient.post('/admin/care/visits', {
        id: crypto.randomUUID(), client_id: scheduleClientId.trim(), nurse_id: scheduleNurseId.trim(), place_id: schedulePlaceId.trim(),
        scheduled_start: new Date(scheduleStart).toISOString(), scheduled_end: new Date(scheduleEnd).toISOString(),
        instructions: scheduleInstructions, confirm_overlap: false, adhoc: false,
      });
      setScheduleInstructions(''); await load(); setActionMessage('Visit scheduled.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Visit could not be scheduled. Check the IDs, dates, and availability.'); }
    finally { setBusy(false); }
  }

  async function openVisitReview(visitId: string) {
    setReviewVisitId(visitId);
    setVisitReview(null);
    setReviewPhotoPanelOpen(false);
    setReviewLoading(true);
    setError('');
    try {
      const result = await apiClient.get<VisitReview>(`/admin/care/visits/${encodeURIComponent(visitId)}`);
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
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/care/visits/${encodeURIComponent(reviewVisitId)}/annotate`, { comment: annotation.trim() });
      setAnnotation('');
      await openVisitReview(reviewVisitId);
      setActionMessage('Visit annotation saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Annotation could not be saved.');
    } finally { setBusy(false); }
  }

  async function resolveReviewFlag(flagId: string) {
    const reason = window.prompt('Resolution note (at least 3 characters)');
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/care/flags/${encodeURIComponent(flagId)}/resolve`, { reason: reason.trim() });
      await openVisitReview(reviewVisitId);
      setActionMessage('Flag resolved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Flag could not be resolved.');
    } finally { setBusy(false); }
  }

  async function resolveFlag(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await apiClient.post(`/admin/care/flags/${encodeURIComponent(selectedFlag)}/resolve`, { reason: resolution });
      setSelectedFlag('');
      setResolution('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(copy.failed ?? 'The action failed.'));
    }
  }

  async function runRowAction(path: string, body: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setActionMessage('');
    try { await apiClient.post(path, body); setActionMessage('Action completed. The list has been refreshed.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  }

  async function exportClientData() {
    setBusy(true);
    setError('');
    setDataActionMessage('');
    setExportedData(null);
    try {
      const result = await apiClient.get<RecordRow>(`/admin/care/data-requests/clients/${encodeURIComponent(dataClientId.trim())}/export`);
      setExportedData(result);
      setDataActionMessage('Client data export loaded. Access has been recorded in the audit log.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client data export could not be loaded.');
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
    if (!window.confirm('Anonymise this client and delete associated photo assets? This action cannot be undone.')) return;
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

  const tabs: CareTab[] = ['nurses', 'clients', 'visits', 'places', 'flags', 'team', 'photos', 'alerts', 'timesheets', 'sos', 'reports', 'settings', 'readiness', 'data'];
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
        <button type="button" onClick={() => void load()} disabled={loading || busy}>
          {String(copy.refresh ?? 'Refresh')}
        </button>
      </header>
      <nav aria-label="Care sections" className="care-tabs">
        {tabs.map((value) => (
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>
            {String((copy.tabs as Record<string, unknown> | undefined)?.[value] ?? tabLabels[value])}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {actionMessage && <p role="status">{actionMessage}</p>}
      {loading && <p role="status">{String(copy.loading ?? 'Loading care data')}</p>}

      {tab === 'places' && <section className="care-form" aria-labelledby="place-management-title">
        <h2 id="place-management-title">Places and client stays</h2>
        <label htmlFor="place-client">Client<select id="place-client" value={placeClientId} onChange={(event) => setPlaceClientId(event.target.value)}><option value="">Choose a client</option>{items.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.display_name ?? item.id)}</option>)}</select></label>
        {placeClientId && <>
          <form onSubmit={createPlace} className="care-form"><h3>Add place</h3><label>Place label<input required maxLength={80} value={placeLabel} onChange={(event) => setPlaceLabel(event.target.value)} /></label><label>Address<input required maxLength={300} value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} /></label><label>Latitude<input required type="number" min="-90" max="90" step="any" value={placeLat} onChange={(event) => setPlaceLat(event.target.value)} /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={placeLng} onChange={(event) => setPlaceLng(event.target.value)} /></label><label>Verification radius in metres<input required type="number" min="50" max="1000" value={placeRadius} onChange={(event) => setPlaceRadius(event.target.value)} /></label><button type="submit" disabled={busy}>Save place</button></form>
          <h3>Existing places</h3>{placeItems.map((place) => <article className="visit-card" key={String(place.id)}><strong>{String(place.label ?? 'Place')}</strong><p>{String(place.address_text ?? '')}</p><p>Place ID: {String(place.id)}</p><button type="button" onClick={() => setStayPlaceId(String(place.id))}>Use for new stay</button></article>)}
          <form onSubmit={moveClient} className="care-form"><h3>Move client</h3><label>New place<select required value={stayPlaceId} onChange={(event) => setStayPlaceId(event.target.value)}><option value="">Choose a place</option>{placeItems.map((place) => <option key={String(place.id)} value={String(place.id)}>{String(place.label ?? place.id)}</option>)}</select></label><label>Stay begins on<input required type="date" value={stayStart} onChange={(event) => setStayStart(event.target.value)} /></label><button type="submit" disabled={busy || !stayPlaceId}>Record move</button></form>
          <h3>Stay history</h3>{stayItems.map((stay) => <article className="visit-card" key={String(stay.id)}><p>Place: {String(stay.place_id)}</p><p>From: {String(stay.starts_on)} to {String(stay.ends_on ?? 'Current stay')}</p></article>)}
        </>}
      </section>}

      {tab === 'visits' && <form className="care-form" onSubmit={scheduleVisit}><h2>Schedule a visit</h2><p>Use IDs from the client, nurse, and place records. The server validates assignment, place ownership, and scheduling conflicts.</p><label>Client ID<input required value={scheduleClientId} onChange={(event) => setScheduleClientId(event.target.value)} /></label><label>Nurse user ID<input required value={scheduleNurseId} onChange={(event) => setScheduleNurseId(event.target.value)} /></label><label>Place ID<input required value={schedulePlaceId} onChange={(event) => setSchedulePlaceId(event.target.value)} /></label><label>Start time<input required type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></label><label>End time<input required type="datetime-local" value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} /></label><label>Instructions for nurse<textarea maxLength={1000} value={scheduleInstructions} onChange={(event) => setScheduleInstructions(event.target.value)} /></label><button type="submit" disabled={busy}>Schedule visit</button></form>}

      {tab === 'clients' && (
        <form className="care-form" onSubmit={createClient}>
          <h2>Create client</h2>
          <label>Client display name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Notes for nurse<textarea maxLength={280} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="submit">{String(copy.createClient ?? 'Create client')}</button>
        </form>
      )}

      {tab === 'flags' && selectedFlag && (
        <form className="care-form" onSubmit={resolveFlag}>
          <h2>Resolve flag</h2>
          <label>Resolution note<textarea required minLength={3} maxLength={500} value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>
          <button type="submit">{String(copy.resolve ?? 'Resolve')}</button>
          <button type="button" onClick={() => setSelectedFlag('')}>Cancel</button>
        </form>
      )}

      {tab === 'data' && (
        <section className="care-form" aria-labelledby="care-data-title">
          <h2 id="care-data-title">Data subject tools</h2>
          <p>Use only after confirming the requester's identity and authority. Every export and anonymisation action is audited.</p>
          <label htmlFor="care-data-client-id">Client ID</label>
          <input id="care-data-client-id" required maxLength={160} value={dataClientId} onChange={(event) => setDataClientId(event.target.value)} />
          <div className="care-data-actions">
            <button type="button" onClick={() => void exportClientData()} disabled={busy || !dataClientId.trim()}>
              {busy ? 'Working' : 'Export client data'}
            </button>
            <button type="button" className="care-danger-button" onClick={() => void anonymiseClientData()} disabled={busy || !dataClientId.trim()}>
              Anonymise client
            </button>
          </div>
          {dataActionMessage && <p role="status">{dataActionMessage}</p>}
          {exportedData && <pre className="care-data-export">{JSON.stringify(exportedData, null, 2)}</pre>}
        </section>
      )}

      {tab === 'visits' && reviewVisitId && (
        <section className="care-review" aria-labelledby="visit-review-title">
          <header className="care-review-header">
            <div><h2 id="visit-review-title">Visit review</h2><p>Visit ID: {reviewVisitId}</p></div>
            <button type="button" onClick={() => { setReviewVisitId(''); setVisitReview(null); setReviewPhotoPanelOpen(false); }}>Close review</button>
          </header>
          {reviewLoading && <p role="status">Loading visit timeline and audit details.</p>}
          {visitReview?.visit && <>
            <dl className="care-review-summary">
              {(['status', 'nurse_id', 'client_id', 'scheduled_start', 'scheduled_end', 'adhoc'] as const).map((key) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{printable(visitReview.visit?.[key])}</dd></div>)}
            </dl>
            <section aria-labelledby="visit-events-title"><h3 id="visit-events-title">Visit timeline</h3>
              {[...(visitReview.events ?? [])].sort((a, b) => String(a.at ?? a.created_at ?? '').localeCompare(String(b.at ?? b.created_at ?? ''))).length === 0 ? <p>No visit events are recorded.</p> : <ol className="care-timeline">{[...(visitReview.events ?? [])].sort((a, b) => String(a.at ?? a.created_at ?? '').localeCompare(String(b.at ?? b.created_at ?? ''))).map((item, index) => <li key={String(item.id ?? `${item.type ?? 'event'}-${index}`)}><strong>{String(item.type ?? item.event_type ?? 'Visit event')}</strong><time>{printable(item.at ?? item.created_at)}</time><p>{String(item.verification ?? item.status ?? '')}</p></li>)}</ol>}
            </section>
            <section aria-labelledby="visit-notes-title"><h3 id="visit-notes-title">Nurse notes</h3>{(visitReview.notes ?? []).length ? <ul>{visitReview.notes?.map((item, index) => <li key={String(item.id ?? index)}>{String(item.body ?? item.note ?? item.text ?? 'Note')} <small>{printable(item.created_at ?? item.at)}</small></li>)}</ul> : <p>No notes are recorded.</p>}</section>
            <section aria-labelledby="visit-flags-title"><h3 id="visit-flags-title">Flags</h3>{(visitReview.flags ?? []).length ? <ul>{visitReview.flags?.map((item, index) => <li key={String(item.id ?? index)}>{String(item.reason ?? item.type ?? 'Visit flag')} · {String(item.status ?? 'open')} {item.status === 'open' && <button type="button" disabled={busy} onClick={() => void resolveReviewFlag(String(item.id ?? ''))}>Resolve flag</button>}</li>)}</ul> : <p>No flags are recorded.</p>}</section>
            <section aria-labelledby="visit-photos-title"><h3 id="visit-photos-title">Photos</h3><button type="button" aria-expanded={reviewPhotoPanelOpen} onClick={() => setReviewPhotoPanelOpen((open) => !open)}>{reviewPhotoPanelOpen ? 'Hide photo records' : 'Open photo records'} ({visitReview.photos?.length ?? 0})</button>{reviewPhotoPanelOpen && <div className="care-photo-records">{(visitReview.photos ?? []).length ? visitReview.photos?.map((photo, index) => <article key={String(photo.id ?? index)}><strong>Photo record {String(photo.id ?? index + 1)}</strong><p>Status: {printable(photo.status)}</p><p>Added: {printable(photo.created_at)}</p><p>Image preview is unavailable until the audited private image endpoint is implemented.</p></article>) : <p>No photo records are attached to this visit.</p>}</div>}</section>
            <section aria-labelledby="visit-annotations-title"><h3 id="visit-annotations-title">Annotations</h3>{(visitReview.annotations ?? []).map((item, index) => <p key={String(item.id ?? index)}>{String(item.comment ?? '')} <small>{printable(item.created_at ?? item.at)}</small></p>)}<form className="care-form" onSubmit={saveAnnotation}><label htmlFor="visit-annotation">Add annotation<textarea id="visit-annotation" required minLength={3} maxLength={1000} value={annotation} onChange={(event) => setAnnotation(event.target.value)} /></label><button type="submit" disabled={busy || annotation.trim().length < 3}>Save annotation</button></form></section>
            <section aria-labelledby="visit-audit-title"><h3 id="visit-audit-title">Audit trail</h3>{(visitReview.audit ?? []).length ? <ol>{visitReview.audit?.map((item, index) => <li key={String(item.id ?? index)}>{String(item.action ?? item.event ?? 'Recorded action')} · {printable(item.at ?? item.created_at)} · {printable(item.actor_id ?? item.user_id)}</li>)}</ol> : <p>No audit entries are attached to this visit.</p>}</section>
          </>}
        </section>
      )}

      {items.length === 0 && !loading && tab !== 'data' && tab !== 'places' ? (
        <p>{String(copy.empty ?? 'No records are available for this view.')}</p>
      ) : tab !== 'data' && tab !== 'places' ? (
        <div className="care-table-wrap">
          <table>
            <caption>{String((copy.tabs as Record<string, unknown> | undefined)?.[tab] ?? tabLabels[tab])}</caption>
            <thead>
              <tr>
                {Object.keys(items[0] ?? {}).filter((key) => !['_id', 'created_at', 'updated_at', 'place_snapshot', 'details'].includes(key)).slice(0, 7).map((key) => (
                  <th key={key} scope="col">{key.replaceAll('_', ' ')}</th>
                ))}
                {['visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(tab) && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={String(item.id ?? item.user_id ?? index)}>
                  {Object.entries(item).filter(([key]) => !['_id', 'created_at', 'updated_at', 'place_snapshot', 'details'].includes(key)).slice(0, 7).map(([key, value]) => (
                    <td key={key}>{printable(value)}</td>
                  ))}
                  {['visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(tab) && <td className="care-row-actions">
                    {tab === 'visits' && <button type="button" onClick={() => void openVisitReview(String(item.id ?? ''))}>Review visit</button>}
                    {tab === 'visits' && item.status === 'scheduled' && <><button type="button" onClick={() => { const nurseId = window.prompt('New nurse user ID'); if (nurseId?.trim()) { setBusy(true); void apiClient.patch(`/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}`, { nurse_id: nurseId.trim() }).then(async () => { setActionMessage('Visit reassigned.'); await load(); }).catch((failure) => setError(failure instanceof Error ? failure.message : 'Visit could not be reassigned.')).finally(() => setBusy(false)); } }}>Reassign</button><button type="button" onClick={() => { const reason = window.prompt('Reason for cancelling this visit'); if (reason?.trim()) void runRowAction(`/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}/cancel`, { reason: reason.trim() }); }}>Cancel visit</button></>}
                    {tab === 'flags' && <button type="button" onClick={() => setSelectedFlag(String(item.id ?? ''))}>Resolve</button>}
                    {tab === 'photos' && item.status !== 'hidden' && item.status !== 'expired' && <button type="button" onClick={() => { const id = String(item.id ?? ''); const reason = window.prompt('Reason for hiding this photo'); if (reason?.trim()) void runRowAction(`/admin/care/photos/${encodeURIComponent(id)}/hide`, { note: reason.trim() }); }}>Hide photo</button>}
                    {tab === 'alerts' && item.status === 'open' && <><button type="button" onClick={() => void runRowAction(`/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`)}>Acknowledge</button><button type="button" onClick={() => { const note = window.prompt('Resolution note'); if (note?.trim()) void runRowAction(`/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/resolve`, { note: note.trim() }); }}>Resolve</button></>}
                    {tab === 'timesheets' && item.status === 'submitted' && <><button type="button" onClick={() => void runRowAction(`/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/approve`)}>Approve</button><button type="button" onClick={() => { const note = window.prompt('Reason for sending back'); if (note?.trim()) void runRowAction(`/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/send-back`, { note: note.trim() }); }}>Send back</button></>}
                    {tab === 'sos' && item.status === 'sent' && <button type="button" onClick={() => void runRowAction(`/admin/care/sos/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`)}>Acknowledge SOS</button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
