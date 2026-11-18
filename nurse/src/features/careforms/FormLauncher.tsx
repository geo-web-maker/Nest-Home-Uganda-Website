import { FormSheet } from './FormSheet';
import { TrackerSheet } from './TrackerSheet';
import { DocumentViewer } from './DocumentViewer';
import type { DocRow } from './store';
import { useState } from 'react';

export type Launch = { formId: string; clientId: string; clientName: string; visitId: string | null; doc?: DocRow; weekStart?: string };
/** Opens the right sheet: signed documents open the sealed viewer first; everything else opens the editor. */
export function FormLauncher({ launch, onClose }: { launch: Launch | null; onClose: () => void }) {
  const [correcting, setCorrecting] = useState(false);
  if (!launch) return null;
  const close = () => { setCorrecting(false); onClose(); };
  if (launch.doc?.status === 'signed' && launch.formId !== 'tracker' && !correcting) {
    return <DocumentViewer doc={launch.doc} clientName={launch.clientName} onClose={close} onCorrect={() => setCorrecting(true)} />;
  }
  if (launch.formId === 'tracker') return <TrackerSheet clientId={launch.clientId} clientName={launch.clientName} visitId={launch.visitId} weekStart={launch.weekStart ?? String(launch.doc?.data.week_start ?? '')} doc={launch.doc} onClose={close} />;
  return <FormSheet formId={launch.formId} clientId={launch.clientId} clientName={launch.clientName} visitId={launch.visitId} doc={launch.doc} onClose={close} />;
}
