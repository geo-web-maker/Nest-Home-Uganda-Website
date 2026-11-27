import type { FormEvent } from 'react';
import type { CachedVisit, LocalPhoto } from '../offline/db';
import { ArriveSheet } from '../screens/ArriveSheet';
import { LeaveSheet } from '../screens/LeaveSheet';
import { NoteSheet } from '../screens/NoteSheet';
import { PhotoSheet, type PhotoType, type ServerVisitPhoto } from '../screens/PhotoSheet';
import type { LocationSnapshot } from '../platform/location';

type ActionKind = 'check_in' | 'check_out' | null;
type LocationState = 'acquiring' | 'good' | 'low_accuracy' | 'denied' | 'unavailable';

type Props = {
  authenticated: boolean;
  actionVisit: CachedVisit | null;
  actionKind: ActionKind;
  actionLocation: LocationSnapshot | null;
  actionLocationState: LocationState;
  actionBusy: boolean;
  safetyTimerEnabled: boolean;
  sosEnabled: boolean;
  finalNote: string;
  canAddRequiredPhoto: boolean;
  requiredPhotoMissing: boolean;
  noteVisit: CachedVisit | undefined;
  noteBody: string;
  photoVisit: CachedVisit | undefined;
  photoFile: File | null;
  localPhotos: LocalPhoto[];
  pendingPhotoCount: number;
  serverPhotos: ServerVisitPhoto[];
  serverPhotosLoading: boolean;
  photosEnabled: boolean;
  photoGuidanceText: string;
  wifiOnly: boolean;
  busy: boolean;
  onSafetyTimerChange: (enabled: boolean) => void;
  onConfirmAction: () => void;
  onCancelArrive: () => void;
  onFinalNoteChange: (value: string) => void;
  onCancelLeave: () => void;
  onAddPhoto: () => void;
  onNoteChange: (value: string) => void;
  onSaveNote: (event: FormEvent) => void;
  onCancelNote: () => void;
  onPhotoFile: (file: File | null) => void;
  onSavePhoto: (event: FormEvent, photoType: PhotoType) => void;
  onDiscardLocalPhoto: (id: string) => void;
  onRetakeLocalPhoto: (id: string) => void;
  onCancelPhoto: () => void;
  onWifiOnlyChange: (value: boolean) => void;
};

/** Modal visit actions are presented here; the app coordinator supplies state and effects. */
export function VisitActionSheets(props: Props) {
  const {
    authenticated,
    actionVisit,
    actionKind,
    actionLocation,
    actionLocationState,
    actionBusy,
    safetyTimerEnabled,
    sosEnabled,
    finalNote,
    canAddRequiredPhoto,
    requiredPhotoMissing,
    noteVisit,
    noteBody,
    photoVisit,
    photoFile,
    localPhotos,
    pendingPhotoCount,
    serverPhotos,
    serverPhotosLoading,
    photosEnabled,
    photoGuidanceText,
    wifiOnly,
    busy,
    onSafetyTimerChange,
    onConfirmAction,
    onCancelArrive,
    onFinalNoteChange,
    onCancelLeave,
    onAddPhoto,
    onNoteChange,
    onSaveNote,
    onCancelNote,
    onPhotoFile,
    onSavePhoto,
    onDiscardLocalPhoto,
    onRetakeLocalPhoto,
    onCancelPhoto,
    onWifiOnlyChange,
  } = props;

  if (!authenticated) return null;

  return (
    <>
      {actionVisit && actionKind === 'check_in' && (
        <ArriveSheet
          visit={actionVisit}
          location={actionLocation}
          locationState={actionLocationState}
          busy={actionBusy}
          safetyTimerEnabled={safetyTimerEnabled}
          canEnableSafetyTimer={sosEnabled}
          onSafetyTimerChange={onSafetyTimerChange}
          onConfirm={onConfirmAction}
          onCancel={onCancelArrive}
        />
      )}
      {actionVisit && actionKind === 'check_out' && (
        <LeaveSheet
          visit={actionVisit}
          finalNote={finalNote}
          busy={actionBusy}
          onFinalNote={onFinalNoteChange}
          onConfirm={onConfirmAction}
          onCancel={onCancelLeave}
          onAddPhoto={onAddPhoto}
          canAddRequiredPhoto={canAddRequiredPhoto}
          requiredPhotoMissing={requiredPhotoMissing}
        />
      )}
      {noteVisit && (
        <NoteSheet
          visit={noteVisit}
          value={noteBody}
          onChange={onNoteChange}
          onSubmit={onSaveNote}
          onCancel={onCancelNote}
        />
      )}
      {photoVisit && (
        <PhotoSheet
          visit={photoVisit}
          file={photoFile}
          onFile={onPhotoFile}
          onSubmit={onSavePhoto}
          onDiscardLocalPhoto={onDiscardLocalPhoto}
          onRetakeLocalPhoto={onRetakeLocalPhoto}
          onCancel={onCancelPhoto}
          pendingPhotos={localPhotos.filter((photo) => photo.visitId === photoVisit.id)}
          pendingCount={pendingPhotoCount}
          serverPhotos={serverPhotos}
          serverPhotosLoading={serverPhotosLoading}
          photosEnabled={photosEnabled}
          guidanceText={photoGuidanceText}
          wifiOnly={wifiOnly}
          onWifiOnly={onWifiOnlyChange}
          busy={busy}
        />
      )}
    </>
  );
}
