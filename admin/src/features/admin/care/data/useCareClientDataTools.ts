import { useCallback, useState } from 'react';
import { dialogs } from '@shared/lib/dialogs';
import { apiClient } from '@shared/lib/api/client';

type ClientDataExport = Record<string, unknown>;
type CareClientDataToolsOptions = {
  load: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

/** Owns the audited client-data export and irreversible anonymisation workflow. */
export function useCareClientDataTools({ load, setBusy, setError }: CareClientDataToolsOptions) {
  const [clientId, setClientId] = useState('');
  const [exportedData, setExportedData] = useState<ClientDataExport | null>(null);
  const [message, setMessage] = useState('');

  const exportClientData = useCallback(async () => {
    setBusy(true);
    setError('');
    setMessage('');
    setExportedData(null);
    try {
      const result = await apiClient.get<ClientDataExport>(
        `/admin/care/data-requests/clients/${encodeURIComponent(clientId.trim())}/export`,
      );
      setExportedData(result);
      setMessage('Client data export loaded. Access has been recorded in the audit log.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client data export could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [clientId, setBusy, setError]);

  const anonymiseClientData = useCallback(async () => {
    const id = clientId.trim();
    if (!id) {
      setError('Enter a client ID first.');
      return;
    }
    if (!await dialogs.confirm(
      'Anonymise this client and delete associated photo assets? This action cannot be undone.',
      { confirmLabel: 'Anonymise client', danger: true },
    )) return;

    setBusy(true);
    setError('');
    setMessage('');
    setExportedData(null);
    try {
      const result = await apiClient.post<{ status: string; photos_deleted: number }>(
        `/admin/care/data-requests/clients/${encodeURIComponent(id)}/anonymise`,
        {},
      );
      setMessage(`Client anonymised. Photos deleted: ${result.photos_deleted}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client could not be anonymised.');
    } finally {
      setBusy(false);
    }
  }, [clientId, load, setBusy, setError]);

  return { clientId, setClientId, exportedData, message, exportClientData, anonymiseClientData };
}
