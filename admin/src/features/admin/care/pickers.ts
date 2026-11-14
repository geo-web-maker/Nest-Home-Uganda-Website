import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const rowsOf = (data: any): Row[] => (Array.isArray(data) ? data : (data?.items ?? [])); // eslint-disable-line @typescript-eslint/no-explicit-any
const fail = async (e: unknown) => {
  await dialogs.alert(e instanceof Error ? e.message : 'Could not load the list.');
  return null;
};

/** Choose an active nurse by name. Resolves the nurse's user id, or null if cancelled. */
export async function pickNurse(message = 'Choose a nurse', excludeId?: string): Promise<string | null> {
  try {
    const nurses = rowsOf(await apiClient.get('/admin/care/nurses')).filter(
      (n) => n.active !== false && String(n.user_id) !== excludeId,
    );
    if (!nurses.length) {
      await dialogs.alert('There are no active nurses to choose from.');
      return null;
    }
    return dialogs.choose(
      message,
      nurses.map((n) => ({ value: String(n.user_id), label: `${n.name ?? 'Nurse'} (${n.staff_number ?? 'no staff number'})` })),
    );
  } catch (e) {
    return fail(e);
  }
}

/** Choose a supervisor by name. Resolves the id, '' to clear the supervisor, null if cancelled. */
export async function pickSupervisor(): Promise<string | null> {
  try {
    const people = rowsOf(await apiClient.get('/admin/care/nurses/supervisor-options'));
    return dialogs.choose(
      'Choose a supervisor',
      people.map((p) => ({ value: String(p.id), label: `${p.name ?? p.email} (${p.kind})` })),
      'No supervisor (clear)',
    );
  } catch (e) {
    return fail(e);
  }
}

/** Choose one of a nurse's active devices. Resolves the device id, or null if cancelled. */
export async function pickDevice(nurseId: string): Promise<string | null> {
  try {
    const details: any = await apiClient.get(`/admin/care/nurses/${encodeURIComponent(nurseId)}/details`); // eslint-disable-line @typescript-eslint/no-explicit-any
    const devices: Row[] = (details?.devices ?? []).filter((d: Row) => !d.revoked_at);
    if (!devices.length) {
      await dialogs.alert('This nurse has no active devices.');
      return null;
    }
    return dialogs.choose(
      'Choose the device to revoke',
      devices.map((d) => ({
        value: String(d.device_id),
        label: `${d.platform} · added ${d.registered_at ? new Date(d.registered_at).toLocaleDateString('en-GB') : 'unknown'} · …${String(d.device_id).slice(-6)}`,
      })),
    );
  } catch (e) {
    return fail(e);
  }
}
