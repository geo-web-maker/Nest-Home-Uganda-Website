import { useCallback, useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api/client';
import { compressPhotoBundle, PHOTO_MAX_BYTES } from './compress';
import { enqueuePhoto, type CachedVisit } from '../../offline/db';
import type { PhotoType, ServerVisitPhoto } from '../../screens/PhotoSheet';

type PhotoMessages = {
  notEnabled: string;
  tooMany: string;
  insufficientStorage: string;
  saved: string;
  failed: string;
  listUnavailable: string;
};

type NursePhotoWorkflowOptions = {
  visits: CachedVisit[];
  currentUserId: string;
  photosEnabled: boolean;
  pendingPhotoCount: number;
  refreshLocal: () => Promise<void>;
  sync: () => Promise<void>;
  setMessage: (message: string) => void;
  messages: PhotoMessages;
  createId: () => string;
};

/** Owns photo capture preparation, local queueing, and the server-photo sheet lifecycle. */
export function useNursePhotoWorkflow(options: NursePhotoWorkflowOptions) {
  const {
    visits, currentUserId, photosEnabled, pendingPhotoCount,
    refreshLocal, sync, setMessage, messages, createId,
  } = options;
  const [visitId, setVisitId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [serverPhotos, setServerPhotos] = useState<ServerVisitPhoto[]>([]);
  const [serverPhotosLoading, setServerPhotosLoading] = useState(false);

  const savePhoto = useCallback(async (event: FormEvent, photoType: PhotoType = 'other') => {
    event.preventDefault();
    if (!visitId || !file) return;
    const visit = visits.find((item) => item.id === visitId);
    if (!photosEnabled || !visit?.photo_rules?.allowed) {
      setMessage(messages.notEnabled);
      return;
    }
    try {
      if (pendingPhotoCount >= 20) setMessage(messages.tooMany);
      const storage = navigator.storage;
      if (storage?.estimate) {
        const estimate = await storage.estimate();
        const available = typeof estimate.quota === 'number' && typeof estimate.usage === 'number'
          ? estimate.quota - estimate.usage
          : undefined;
        if (available !== undefined && available < PHOTO_MAX_BYTES * 2) {
          throw new Error(messages.insufficientStorage);
        }
      }
      const prepared = await compressPhotoBundle(file);
      await enqueuePhoto({
        id: createId(),
        visitId,
        ownerUserId: currentUserId,
        blob: prepared.image,
        thumbnail: prepared.thumbnail,
        mime: 'image/jpeg',
        photoType,
        uploadStage: 'pending_upload',
        createdAt: new Date().toISOString(),
      });
      setVisitId('');
      setFile(null);
      await refreshLocal();
      setMessage(messages.saved);
      if (navigator.onLine) void sync();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : messages.failed);
    }
  }, [visitId, file, visits, photosEnabled, pendingPhotoCount, messages, createId, currentUserId, refreshLocal, setMessage, sync]);

  const openPhoto = useCallback((visit: CachedVisit) => {
    setVisitId(visit.id);
    setFile(null);
    setServerPhotos([]);
    if (!navigator.onLine) {
      setServerPhotosLoading(false);
      return;
    }
    setServerPhotosLoading(true);
    void apiRequest<{ items: ServerVisitPhoto[] }>(
      `/field/visits/${encodeURIComponent(visit.id)}/photos`,
    )
      .then((result) => setServerPhotos(Array.isArray(result.items) ? result.items : []))
      .catch(() => setMessage(messages.listUnavailable))
      .finally(() => setServerPhotosLoading(false));
  }, [messages.listUnavailable, setMessage]);

  const closePhoto = useCallback(() => {
    setVisitId('');
    setFile(null);
    setServerPhotos([]);
    setServerPhotosLoading(false);
  }, []);

  return {
    photoVisitId: visitId,
    photoFile: file,
    serverPhotos,
    serverPhotosLoading,
    setPhotoVisitId: setVisitId,
    setPhotoFile: setFile,
    savePhoto,
    openPhoto,
    closePhoto,
  };
}
