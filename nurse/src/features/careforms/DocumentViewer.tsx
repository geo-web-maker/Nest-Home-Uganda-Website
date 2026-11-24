import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api/client';
import { fetchAndCachePdf, readCachedPdf } from './pdfCache';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { PillLink } from '../../ui/PillLink';
import { Sheet, SheetActions } from '../../ui/Sheet';
import { formTitle } from './rules';
import type { DocRow } from './store';
import { useCareFormsContext } from './useCareForms';

/** Signed-document viewer: the sealed PDF (signature evidence is printed on it), Download, and Resend copy only when the admin switch is on. */
export function DocumentViewer({ doc, clientName, onClose, onCorrect }: { doc: DocRow; clientName: string; onClose: () => void; onCorrect: () => void }) {
  const care = useCareFormsContext();
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const local = doc.id.startsWith('local-');
  useEffect(() => {
    if (local) return undefined;
    let revoked = ''; let cancelled = false;
    void (async () => {
      try {
        let pdf: Blob | null = null;
        let failure: unknown = null;
        if (navigator.onLine && sessionStorage.getItem('nurse_access_token')) {
          try { pdf = await fetchAndCachePdf(doc.id); } catch (e) { failure = e; }
        }
        if (!pdf) pdf = await readCachedPdf(doc.id); // offline, or the server could not be reached: use the saved copy
        if (!pdf) {
          const status = (failure as { status?: number } | null)?.status;
          if (status === 403) throw new Error('Open your Profile and check your UNMC details.');
          throw new Error(failure || navigator.onLine ? 'The document could not be loaded.' : 'This document has not been opened on this device yet. Connect to the internet once to view it.');
        }
        const blob = URL.createObjectURL(pdf); revoked = blob; if (!cancelled) setUrl(blob);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'The document could not be loaded.'); }
    })();
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [doc.id, local]);
  async function resend() {
    try { const r = await apiRequest<{ copy: string }>(`/field/care-forms/${doc.id}/resend`, { method: 'POST' }); setNote(r.copy === 'sent' ? 'Copy emailed.' : r.copy === 'failed' ? 'The copy could not be sent. See Sync.' : 'No email copy: the client did not agree or has no address.'); }
    catch (e) { setNote((e as { detail?: string }).detail ?? 'Could not resend.'); }
  }
  return <Sheet labelledBy="dv-title" className="cf-sheet cf-viewer">
    <h2 id="dv-title">{formTitle(doc.form_id)}</h2>
    <p className="cf-hint">{clientName} · signed {doc.signed_at ? new Date(doc.signed_at).toLocaleString('en-GB') : ''}{doc.queued ? ' · waiting to sync' : ''}</p>
    {local && <Banner tone="info">This document is saved on this device and will be available to view after it syncs.</Banner>}
    {error && <Banner tone="warn">{error}</Banner>}
    {url && <iframe title="Signed document" src={url} className="cf-pdf" />}
    {note && <Banner tone="info">{note}</Banner>}
    <SheetActions>
      {url && <PillLink tone="gold" size="full" href={url} download={`form-${doc.form_id}.pdf`}>Download</PillLink>}
      {care?.autoEmail && care.online && !local && <PillButton tone="ghost" size="full" showArrow={false} onClick={() => void resend()}>Resend copy</PillButton>}
      <PillButton tone="ghost" size="full" showArrow={false} onClick={onCorrect}>Add a correction</PillButton>
      <PillButton tone="ghost" size="full" showArrow={false} onClick={onClose}>Close</PillButton>
    </SheetActions>
  </Sheet>;
}
