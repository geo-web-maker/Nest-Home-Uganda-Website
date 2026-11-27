import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LoadingNote } from '../../../components/admin/LoadingNote';
import { pickNurse } from './pickers';
import { dialogs } from '@shared/lib/dialogs';
import { useTranslation } from 'react-i18next';
import { Button } from '@shared/components/ui/Button';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { ApiError, apiClient } from '@shared/lib/api/client';
import './care.css';
import { CARE_TABS, CARE_TAB_LABELS, type CareTab } from './careWorkspaceConfig';
import { PlacesPanel } from './places/PlacesPanel';
import { ScheduleVisitPanel } from './visits/ScheduleVisitPanel';
import { VisitReviewPanel } from './visits/VisitReviewPanel';
import { CreateClientPanel } from './clients/CreateClientPanel';
import { ResolveFlagPanel } from './flags/ResolveFlagPanel';
import { DataToolsPanel } from './data/DataToolsPanel';
import { useCareClientDataTools } from './data/useCareClientDataTools';
import { requestTotp } from '@shared/lib/totpPrompt';
import { CareRecordsTable, type CareRecordRow } from './CareRecordsTable';

type RecordRow = CareRecordRow;
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

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
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

  const clientDataTools = useCareClientDataTools({ load, setBusy, setError });
  const {
    clientId: dataClientId,
    setClientId: setDataClientId,
    exportedData,
    message: dataActionMessage,
    exportClientData,
    anonymiseClientData,
  } = clientDataTools;

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
    const reason = await dialogs.prompt('Resolution note', '', { minLength: 3, multiline: true, confirmLabel: 'Resolve' });
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



  const reassignVisit = async (item: RecordRow) => {
    const nurseId = await pickNurse('Choose the new nurse', String(item.nurse_id ?? ''));
    if (!nurseId?.trim()) return;
    setBusy(true);
    void apiClient
      .patch(`/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}`, { nurse_id: nurseId.trim() })
      .then(async () => {
        setActionMessage('Visit reassigned.');
        await load();
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : 'Visit could not be reassigned.'))
      .finally(() => setBusy(false));
  };

  const cancelVisit = async (item: RecordRow) => {
    const reason = await dialogs.prompt('Reason for cancelling this visit', '', {
      minLength: 3, multiline: true, confirmLabel: 'Cancel visit',
    });
    if (reason?.trim()) {
      void runRowAction(`/admin/care/visits/${encodeURIComponent(String(item.id ?? ''))}/cancel`, { reason: reason.trim() });
    }
  };

  const hidePhoto = async (item: RecordRow) => {
    const reason = await dialogs.prompt('Reason for hiding this photo', '', {
      minLength: 3, multiline: true, confirmLabel: 'Hide photo',
    });
    if (reason?.trim()) {
      void runRowAction(`/admin/care/photos/${encodeURIComponent(String(item.id ?? ''))}/hide`, { note: reason.trim() });
    }
  };

  const resolveAlert = async (item: RecordRow) => {
    const note = await dialogs.prompt('Resolution note', '', {
      minLength: 3, multiline: true, confirmLabel: 'Resolve',
    });
    if (note?.trim()) {
      void runRowAction(`/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/resolve`, { note: note.trim() });
    }
  };

  const sendBackTimesheet = async (item: RecordRow) => {
    const note = await dialogs.prompt('Reason for sending back', '', {
      minLength: 3, multiline: true, confirmLabel: 'Send back',
    });
    if (note?.trim()) {
      void runRowAction(`/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/send-back`, { note: note.trim() });
    }
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
        tabs={CARE_TABS.map((value) => ({
          value,
          label: String((copy.tabs as Record<string, unknown> | undefined)?.[value] ?? CARE_TAB_LABELS[value]),
        }))}
      />
      {error && <p role="alert">{error}</p>}
      {actionMessage && <p role="status">{actionMessage}</p>}
      {loading && <LoadingNote>{String(copy.loading ?? 'Loading care data')}</LoadingNote>}

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
          onUnlockAudit={() => { void requestTotp().then((ok) => { if (ok) void openVisitReview(reviewVisitId); }); }}
          onSaveAnnotation={saveAnnotation}
          printable={printable}
        />
      )}

      {items.length === 0 && !loading && tab !== 'data' && tab !== 'places' ? (
        <p>{String(copy.empty ?? 'No records are available for this view.')}</p>
      ) : items.length > 0 && tab !== 'data' && tab !== 'places' ? (
        <CareRecordsTable
          tab={tab}
          items={items}
          caption={String((copy.tabs as Record<string, unknown> | undefined)?.[tab] ?? CARE_TAB_LABELS[tab])}
          onReviewVisit={(item) => void openVisitReview(String(item.id ?? ''))}
          onReassignVisit={(item) => void reassignVisit(item)}
          onCancelVisit={(item) => void cancelVisit(item)}
          onSelectFlag={(item) => setSelectedFlag(String(item.id ?? ''))}
          onHidePhoto={(item) => void hidePhoto(item)}
          onAcknowledgeAlert={(item) => void runRowAction(`/admin/care/alerts/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`)}
          onResolveAlert={(item) => void resolveAlert(item)}
          onApproveTimesheet={(item) => void runRowAction(`/admin/care/timesheets/${encodeURIComponent(String(item.id ?? ''))}/approve`)}
          onSendBackTimesheet={(item) => void sendBackTimesheet(item)}
          onAcknowledgeSos={(item) => void runRowAction(`/admin/care/sos/${encodeURIComponent(String(item.id ?? ''))}/acknowledge`)}
        />
      ) : null}
    </section>
  );
}
