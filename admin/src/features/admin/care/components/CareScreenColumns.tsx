/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dispatch, SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { UserPublic } from '@shared/types';
import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';
import { cellText, headerFor } from '@shared/lib/tableText';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Button } from '@shared/components/ui/Button';
import type { DataColumn } from '../../../../components/admin/DataTable';
import { hasScopes } from '../../auth/hasScopes';
import { pickDevice, pickNurse, pickSupervisor } from '../pickers';
import type { ScreenKey } from '../careScreenConfig';

type Row = Record<string, any>;
type Action = (path: string, body?: Row, method?: 'post' | 'patch' | 'put') => Promise<void>;

/** Builds the care screen's data columns and keeps per-row action UI outside the page coordinator. */
export function buildCareScreenColumns({
  screen,
  visibleRows,
  user,
  navigate,
  setSelected,
  setNotice,
  setError,
  load,
  act,
}: {
  screen: ScreenKey;
  visibleRows: Row[];
  user: UserPublic | null;
  navigate: NavigateFunction;
  setSelected: Dispatch<SetStateAction<Row | null>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  load: () => Promise<void>;
  act: Action;
}): DataColumn<Row>[] {
    const keys = visibleRows
      .slice(0, 8)
      .flatMap((r) => Object.keys(r))
      .filter((k) => screen !== 'nurses' || (k !== 'user_id' && k !== 'supervisor_id'))
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5);
    const base: DataColumn<Row>[] = screen === 'audit'
      ? (['at', 'severity', 'action', 'message', 'user_name', 'source', 'http_status', 'request_id'] as const).map((key) => ({
          key,
          header: headerFor(key),
          cell: (r: Row) => cellText(key, r[key]),
        }))
      : (keys.length ? keys : ['id', 'status', 'name', 'created_at']).map((key) => ({
          key,
          header: headerFor(key),
          cell: (r: Row) => cellText(key, r[key]),
        }));
    if (screen === 'audit') {
      base.push({
        key: 'details',
        header: 'Details',
        cell: (r: Row) => <Button type="button" variant="outline" onClick={() => setSelected(r)}>Inspect</Button>,
      });
    }
    if (['nurses', 'clients', 'visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos'].includes(screen))
      base.push({
        key: 'actions',
        header: 'Actions',
        cell: (r: Row) => (
          <ButtonGroup size="compact">
            {screen === 'clients' && (
              <Button type="button" variant="outline" onClick={() => navigate(`/care/clients/${encodeURIComponent(String(r.id ?? ''))}`)}>
                Details
              </Button>
            )}
            {screen === 'nurses' && (
              <>
                <Button type="button" variant="outline" onClick={() => navigate(`/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}`)}>
                  Details
                </Button>
                {Boolean(r.dual_account) && <small>Also an admin</small>}
                {hasScopes(user, ['nurses:write']) && (
                  <>
                    {!r.dual_account && <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        act(`/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}/invite`)
                      }
                    >
                      Resend invite
                    </Button>}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const device = await pickDevice(String(r.user_id ?? ''));
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
                      {r.active ? 'Deactivate nurse access' : 'Activate nurse access'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const supervisor = await pickSupervisor();
                        if (supervisor === null) return;
                        void act(
                          `/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}/supervisor`,
                          { supervisor_id: supervisor || null },
                          'patch',
                        );
                      }}
                    >
                      Supervisor
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const confirmation = r.dual_account
                          ? 'Remove this person’s nurse access? Their existing staff account will remain. This cannot be undone.'
                          : 'Delete this nurse permanently? This cannot be undone.';
                        if (!(await dialogs.confirm(confirmation))) return;
                        try {
                          setNotice('');
                          await apiClient.delete(`/admin/care/nurses/${encodeURIComponent(String(r.user_id ?? ''))}`);
                          setNotice(r.dual_account ? 'Nurse access removed. The staff account remains.' : 'Nurse deleted.');
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Delete failed');
                        }
                      }}
                    >
                      {r.dual_account ? 'Remove nurse access' : 'Delete'}
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
                    navigate(`/care/visits/${encodeURIComponent(String(r.id ?? ''))}`)
                  }
                >
                  Review
                </Button>
                {hasScopes(user, ['visits:write']) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const nurse = await pickNurse('Choose the replacement nurse', String(r.nurse_id ?? ''));
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
                onClick={async () => {
                  const note = await dialogs.prompt('Resolution note', '', { minLength: 3, multiline: true, confirmLabel: 'Resolve' });
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
                  onClick={async () => {
                    const note = await dialogs.prompt('Reason for hiding this photo', '', { minLength: 3, multiline: true, confirmLabel: 'Hide photo' });
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
                  onClick={async () => {
                    const note = await dialogs.prompt('Resolution note', '', { minLength: 3, multiline: true, confirmLabel: 'Resolve' });
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
                  onClick={async () => {
                    const note = await dialogs.prompt('Reason for sending back', '', { minLength: 3, multiline: true, confirmLabel: 'Send back' });
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
                  onClick={async () => {
                    const answers = await dialogs.form(
                      'Adjust this timesheet',
                      [
                        { name: 'minutes', label: 'Adjustment minutes (use a minus sign to remove time)', type: 'number', required: true },
                        { name: 'reason', label: 'Reason', type: 'textarea', minLength: 3 },
                      ],
                      'Apply adjustment',
                    );
                    if (answers)
                      void act(
                        `/admin/care/timesheets/${encodeURIComponent(String(r.id ?? ''))}/adjust`,
                        { minutes: Number(answers.minutes), reason: answers.reason },
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
          </ButtonGroup>
        ),
      } as any);
    return base as DataColumn<Row>[];
  
}
