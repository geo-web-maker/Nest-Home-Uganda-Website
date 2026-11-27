import { useEffect, useState } from 'react';
import { Button } from '@shared/components/ui/Button';
import { Modal } from '@shared/components/dialogs/Modal';
import { apiClient } from '@shared/lib/api/client';
import './care-forms-admin.css';
import { LoadingNote } from '../../../../components/admin/LoadingNote';

type SignatureEvidence = {
  role: string;
  name: string;
  method: string;
  signed_at?: string | null;
  registration_line?: string | null;
  document_hash?: string | null;
};
type CareDocument = {
  id: string;
  form_id: string;
  status: 'draft' | 'pending' | 'signed';
  version: number;
  signed_at?: string | null;
  document_hash?: string | null;
  signatures: SignatureEvidence[];
};

function when(value?: string | null): string {
  if (!value) return 'Not signed';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Admin read-only documents surface. The API returns metadata/evidence; the signed PDF is fetched separately. */
export function CareFormsAdminPanel({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<CareDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<CareDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void apiClient.get<{ items: CareDocument[] }>(`/admin/care/care-forms`, { params: { client_id: clientId } })
      .then((result) => { if (live) setItems(result.items ?? []); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Care documents could not be loaded.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [clientId]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function openPdf(doc: CareDocument) {
    setOpening(true); setPdfError(''); setActive(doc);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
    try {
      const blob = await apiClient.getBlob(`/admin/care/care-forms/${encodeURIComponent(doc.id)}/pdf`);
      setPdfUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
    } catch (reason) {
      setPdfError(reason instanceof Error ? reason.message : 'The signed PDF could not be opened.');
    } finally { setOpening(false); }
  }

  function closeViewer() {
    setActive(null);
    setPdfError('');
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
  }

  return <section className="care-form cf-admin-documents" aria-labelledby="care-documents-title">
    <div className="cf-admin-head"><div><h2 id="care-documents-title">Care forms and signature evidence</h2><p>Read-only clinical records. Corrections are added as a new version by the nurse; this view never edits a signed form.</p></div><Button type="button" variant="outline" loading={loading} onClick={() => { setLoading(true); setError(''); void apiClient.get<{ items: CareDocument[] }>('/admin/care/care-forms', { params: { client_id: clientId } }).then((r) => setItems(r.items ?? [])).catch((e) => setError(e instanceof Error ? e.message : 'Care documents could not be loaded.')).finally(() => setLoading(false)); }}>Refresh</Button></div>
    {loading ? <LoadingNote>Loading care documents…</LoadingNote> : error ? <p role="alert">{error}</p> : items.length === 0 ? <p>No care forms have been saved for this patient.</p> : <div className="cf-admin-doc-list">
      {items.map((doc) => <article className="cf-admin-doc" key={doc.id}>
        <div><strong>{doc.form_id === 'tracker' ? 'Weekly tracker' : `Form ${doc.form_id}`}</strong><p>Version {doc.version} · {doc.status} · {when(doc.signed_at)}</p>
          <div className="cf-admin-signatures"><strong>Signature evidence</strong>{doc.signatures.length ? doc.signatures.map((sig, index) => <p key={`${sig.role}:${sig.signed_at}:${index}`}><b>{sig.role}</b>: {sig.name} · {sig.method} · {when(sig.signed_at)}{sig.registration_line ? <><br /><span>{sig.registration_line}</span></> : null}{sig.document_hash ? <code>{sig.document_hash}</code> : null}</p>) : <p>No signatures recorded.</p>}</div>
        </div>
        <Button type="button" variant="outline" disabled={doc.status !== 'signed' || opening} onClick={() => void openPdf(doc)}>{opening && active?.id === doc.id ? 'Opening…' : 'View signed PDF'}</Button>
      </article>)}
    </div>}
    {active && <Modal
      id="cf-admin-viewer-title"
      title={`${active.form_id === 'tracker' ? 'Weekly tracker' : `Form ${active.form_id}`} · version ${active.version}`}
      subtitle={`Signed ${when(active.signed_at)}`}
      onClose={closeViewer}
      className="cf-admin-viewer"
    >
      {pdfError ? <p role="alert">{pdfError}</p> : pdfUrl ? <><div className="cf-admin-viewer__actions"><a href={pdfUrl} download={`care-form-${active.form_id}-v${active.version}.pdf`}>Download PDF</a></div><iframe title="Sealed care document" src={pdfUrl} /></> : <p role="status">Preparing secure document view…</p>}
    </Modal>}
  </section>;
}
